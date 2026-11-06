-- 소리숲(SUP) Supabase 스키마
-- Supabase 대시보드 > SQL Editor에 통째로 붙여 넣고 실행하세요.
-- 실행 전: Authentication > Sign In / Providers > "Allow anonymous sign-ins"를 켜 주세요.

create extension if not exists pgcrypto;

-- ───────── 테이블 ─────────
create table if not exists public.gardens (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nickname text not null,
  created_at timestamptz not null default now(),
  unique (garden_id, user_id)
);

create table if not exists public.flowers (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  sender_id uuid not null references public.members(id) on delete cascade,
  audio_path text not null,
  category text not null,    -- 목소리: 감정 꽃 id(joy, calm …) / 다른 소리: 'sound'
  root text not null,
  name text not null,
  reason text,
  transcript text,            -- 꽃말
  rms real, centroid real, attack real, onsets int,
  vowel text, consonant text,
  color text, petals int,
  lengths real[],             -- 꽃잎별 길이 = 시간에 따른 소리 크기
  sent_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists flowers_garden_idx on public.flowers (garden_id, sent_date);

create table if not exists public.pair_flowers (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  flower_a_id uuid not null references public.flowers(id) on delete cascade,
  flower_b_id uuid not null references public.flowers(id) on delete cascade,
  name text not null,
  sent_date date not null,
  created_at timestamptz not null default now(),
  unique (garden_id, sent_date)  -- 하루에 우리의 꽃은 하나
);

-- ───────── 내가 속한 정원 (RLS 재귀 방지용) ─────────
create or replace function public.my_garden_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select garden_id from public.members where user_id = auth.uid()
$$;

-- ───────── 방 만들기 / 입장 (6자리 코드, 최대 2명) ─────────
create or replace function public.create_garden(p_nickname text)
returns json language plpgsql security definer set search_path = public as $$
declare g public.gardens; m public.members; c text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  loop
    c := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from public.gardens where code = c);
  end loop;
  insert into public.gardens (code) values (c) returning * into g;
  insert into public.members (garden_id, user_id, nickname) values (g.id, auth.uid(), p_nickname) returning * into m;
  return json_build_object('garden_id', g.id, 'member_id', m.id, 'code', g.code);
end $$;

create or replace function public.join_garden(p_code text, p_nickname text)
returns json language plpgsql security definer set search_path = public as $$
declare g public.gardens; m public.members;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into g from public.gardens where code = p_code;
  if not found then raise exception 'GARDEN_NOT_FOUND'; end if;
  select * into m from public.members where garden_id = g.id and user_id = auth.uid();
  if found then
    update public.members set nickname = p_nickname where id = m.id returning * into m;
  else
    if (select count(*) from public.members where garden_id = g.id) >= 2 then raise exception 'GARDEN_FULL'; end if;
    insert into public.members (garden_id, user_id, nickname) values (g.id, auth.uid(), p_nickname) returning * into m;
  end if;
  return json_build_object('garden_id', g.id, 'member_id', m.id, 'code', g.code);
end $$;

revoke all on function public.create_garden(text) from public, anon;
revoke all on function public.join_garden(text, text) from public, anon;
grant execute on function public.create_garden(text) to authenticated;
grant execute on function public.join_garden(text, text) to authenticated;
grant execute on function public.my_garden_ids() to authenticated;

-- ───────── RLS: 정원 단위 ─────────
alter table public.gardens enable row level security;
alter table public.members enable row level security;
alter table public.flowers enable row level security;
alter table public.pair_flowers enable row level security;

drop policy if exists "gardens: members read" on public.gardens;
create policy "gardens: members read" on public.gardens for select to authenticated
  using (id in (select public.my_garden_ids()));

drop policy if exists "members: same garden read" on public.members;
create policy "members: same garden read" on public.members for select to authenticated
  using (garden_id in (select public.my_garden_ids()));

drop policy if exists "flowers: garden read" on public.flowers;
create policy "flowers: garden read" on public.flowers for select to authenticated
  using (garden_id in (select public.my_garden_ids()));

drop policy if exists "flowers: send own" on public.flowers;
create policy "flowers: send own" on public.flowers for insert to authenticated
  with check (
    garden_id in (select public.my_garden_ids())
    and sender_id in (select id from public.members where user_id = auth.uid())
  );

drop policy if exists "flowers: delete own" on public.flowers;
create policy "flowers: delete own" on public.flowers for delete to authenticated
  using (sender_id in (select id from public.members where user_id = auth.uid()));

drop policy if exists "pairs: garden read" on public.pair_flowers;
create policy "pairs: garden read" on public.pair_flowers for select to authenticated
  using (garden_id in (select public.my_garden_ids()));

drop policy if exists "pairs: garden insert" on public.pair_flowers;
create policy "pairs: garden insert" on public.pair_flowers for insert to authenticated
  with check (garden_id in (select public.my_garden_ids()));

-- ───────── Storage: 비공개 버킷, 경로 = {garden_id}/{파일} ─────────
insert into storage.buckets (id, name, public) values ('sounds', 'sounds', false)
on conflict (id) do nothing;

drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (bucket_id = 'sounds' and (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g));

drop policy if exists "sounds: garden upload" on storage.objects;
create policy "sounds: garden upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g));

drop policy if exists "sounds: garden delete" on storage.objects;
create policy "sounds: garden delete" on storage.objects for delete to authenticated
  using (bucket_id = 'sounds' and owner_id = auth.uid()::text);

-- ───────── Realtime ─────────
do $$
begin
  begin alter publication supabase_realtime add table public.flowers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.pair_flowers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.members; exception when duplicate_object then null; end;
end $$;

-- ───────── 친구 정원으로 옮기기 (migrations-003.sql과 같음) ─────────
create or replace function public.join_friend_garden(p_code text, p_nickname text default null)
returns json language plpgsql security definer set search_path = public as $$
declare g public.gardens; old public.members; m public.members; moved int := 0;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into g from public.gardens where code = p_code;
  if not found then raise exception 'GARDEN_NOT_FOUND'; end if;

  -- 이미 그 정원의 멤버면 그대로 들어간다
  select * into m from public.members where garden_id = g.id and user_id = auth.uid();
  if found then
    return json_build_object('garden_id', g.id, 'member_id', m.id, 'code', g.code, 'moved', 0);
  end if;
  if (select count(*) from public.members where garden_id = g.id) >= 2 then raise exception 'GARDEN_FULL'; end if;

  -- 지금 내 정원
  select * into old from public.members where user_id = auth.uid() order by created_at desc limit 1;
  if found and (select count(*) from public.members where garden_id = old.garden_id) >= 2 then
    raise exception 'ALREADY_PAIRED';
  end if;

  insert into public.members (garden_id, user_id, nickname)
  values (g.id, auth.uid(), coalesce(nullif(trim(p_nickname), ''), old.nickname, '나'))
  returning * into m;

  if old.id is not null then
    update public.flowers set garden_id = g.id, sender_id = m.id where sender_id = old.id;
    get diagnostics moved = row_count;
    delete from public.members where id = old.id;
    delete from public.gardens gg where gg.id = old.garden_id
      and not exists (select 1 from public.members mm where mm.garden_id = gg.id);
  end if;

  return json_build_object('garden_id', g.id, 'member_id', m.id, 'code', g.code, 'moved', moved);
end $$;

revoke all on function public.join_friend_garden(text, text) from public, anon;
grant execute on function public.join_friend_garden(text, text) to authenticated;

-- 2) 소리 재생 권한: 내 정원 폴더의 파일 + 내 정원의 꽃이 가리키는 파일(옮겨 온 꽃의 소리)
drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (
    bucket_id = 'sounds' and (
      (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g)
      or exists (
        select 1 from public.flowers f
        where f.audio_path = storage.objects.name
          and f.garden_id in (select public.my_garden_ids())
      )
    )
  );

-- ───────── 친구 맺기와 소리 공유 (migrations-004.sql과 같음) ─────────
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null,
  user_b uuid not null,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
alter table public.friendships enable row level security;

drop policy if exists "friendships: mine read" on public.friendships;
create policy "friendships: mine read" on public.friendships for select to authenticated
  using (auth.uid() in (user_a, user_b));
drop policy if exists "friendships: mine delete" on public.friendships;
create policy "friendships: mine delete" on public.friendships for delete to authenticated
  using (auth.uid() in (user_a, user_b));

create or replace function public.my_friend_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select case when user_a = auth.uid() then user_b else user_a end
  from public.friendships where auth.uid() in (user_a, user_b)
$$;

-- 친구 코드(= 상대 정원 코드)로 친구를 맺는다
create or replace function public.add_friend(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare g public.gardens; owner uuid; nick text;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into g from public.gardens where code = p_code;
  if not found then raise exception 'GARDEN_NOT_FOUND'; end if;
  select user_id, nickname into owner, nick from public.members where garden_id = g.id order by created_at limit 1;
  if owner is null then raise exception 'GARDEN_NOT_FOUND'; end if;
  if owner = auth.uid() then raise exception 'SELF_FRIEND'; end if;
  insert into public.friendships (user_a, user_b)
  values (least(owner, auth.uid()), greatest(owner, auth.uid()))
  on conflict (user_a, user_b) do nothing;
  return json_build_object('user_id', owner, 'nickname', nick);
end $$;

-- 내 친구 목록: 친구의 (가장 최근) 정원 멤버 정보와 친구가 된 날
create or replace function public.my_friends()
returns table (user_id uuid, member_id uuid, nickname text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select f.uid, m.id, m.nickname, f.since
  from (
    select case when user_a = auth.uid() then user_b else user_a end as uid, created_at as since
    from public.friendships where auth.uid() in (user_a, user_b)
  ) f
  join lateral (
    select id, nickname from public.members where members.user_id = f.uid order by created_at desc limit 1
  ) m on true
  order by f.since
$$;

revoke all on function public.add_friend(text) from public, anon;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.add_friend(text) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.my_friend_ids() to authenticated;

-- ───────── 소리 공유 (내 꽃 하나를 친구 한 명에게) ─────────
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  flower_id uuid not null references public.flowers(id) on delete cascade,
  from_user uuid not null default auth.uid(),
  to_user uuid not null,
  created_at timestamptz not null default now(),
  unique (flower_id, to_user)
);
create index if not exists shares_to_idx on public.shares (to_user, created_at);
alter table public.shares enable row level security;

drop policy if exists "shares: mine read" on public.shares;
create policy "shares: mine read" on public.shares for select to authenticated
  using (auth.uid() in (from_user, to_user));

drop policy if exists "shares: share own flower to friend" on public.shares;
create policy "shares: share own flower to friend" on public.shares for insert to authenticated
  with check (
    from_user = auth.uid()
    and to_user in (select public.my_friend_ids())
    and flower_id in (
      select f.id from public.flowers f join public.members m on m.id = f.sender_id where m.user_id = auth.uid()
    )
  );

drop policy if exists "shares: mine delete" on public.shares;
create policy "shares: mine delete" on public.shares for delete to authenticated
  using (from_user = auth.uid());

-- 공유받은 꽃은 내 정원 밖에 있어도 읽을 수 있다
drop policy if exists "flowers: shared read" on public.flowers;
create policy "flowers: shared read" on public.flowers for select to authenticated
  using (id in (select flower_id from public.shares where to_user = auth.uid()));

-- 공유받은 꽃의 소리 파일도 재생할 수 있다
drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (
    bucket_id = 'sounds' and (
      (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g)
      or exists (
        select 1 from public.flowers f
        where f.audio_path = storage.objects.name
          and (
            f.garden_id in (select public.my_garden_ids())
            or f.id in (select flower_id from public.shares where to_user = auth.uid())
          )
      )
    )
  );

-- 실시간: 친구가 공유하거나 친구를 맺으면 바로 보이게
do $$
begin
  begin alter publication supabase_realtime add table public.shares; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.friendships; exception when duplicate_object then null; end;
end $$;

-- ───────── 정원 공개·방문, 받은 소리 고르기 (migrations-005.sql과 같음) ─────────
alter table public.gardens add column if not exists is_public boolean not null default false;

create or replace function public.set_garden_public(p_public boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.gardens set is_public = p_public
  where id in (select garden_id from public.members where user_id = auth.uid());
end $$;
revoke all on function public.set_garden_public(boolean) from public, anon;
grant execute on function public.set_garden_public(boolean) to authenticated;

-- 놀러 갈 수 있는 정원: 친구의 공개 정원
create or replace function public.visitable_garden_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.id from public.gardens g
  join public.members m on m.garden_id = g.id
  where g.is_public and m.user_id in (select public.my_friend_ids())
$$;
grant execute on function public.visitable_garden_ids() to authenticated;

-- 친구 목록에 친구 정원과 공개 여부를 함께 (반환 모양이 바뀌어 다시 만든다)
drop function if exists public.my_friends();
create function public.my_friends()
returns table (user_id uuid, member_id uuid, nickname text, since timestamptz, garden_id uuid, is_public boolean)
language sql stable security definer set search_path = public as $$
  select f.uid, m.id, m.nickname, f.since, m.garden_id, g.is_public
  from (
    select case when user_a = auth.uid() then user_b else user_a end as uid, created_at as since
    from public.friendships where auth.uid() in (user_a, user_b)
  ) f
  join lateral (
    select id, nickname, garden_id from public.members where members.user_id = f.uid order by created_at desc limit 1
  ) m on true
  join public.gardens g on g.id = m.garden_id
  order by f.since
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated;

-- 방문: 친구의 공개 정원과 그 정원의 꽃·소리를 볼 수 있다 (친구가 받은 소리는 정원에 저장되지 않으므로 보이지 않음)
drop policy if exists "gardens: visit public" on public.gardens;
create policy "gardens: visit public" on public.gardens for select to authenticated
  using (id in (select public.visitable_garden_ids()));
drop policy if exists "members: visit public" on public.members;
create policy "members: visit public" on public.members for select to authenticated
  using (garden_id in (select public.visitable_garden_ids()));
drop policy if exists "flowers: visit public" on public.flowers;
create policy "flowers: visit public" on public.flowers for select to authenticated
  using (garden_id in (select public.visitable_garden_ids()));

drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (
    bucket_id = 'sounds' and (
      (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g)
      or (storage.foldername(name))[1] in (select g::text from public.visitable_garden_ids() as g)
      or exists (
        select 1 from public.flowers f
        where f.audio_path = storage.objects.name
          and (
            f.garden_id in (select public.my_garden_ids())
            or f.garden_id in (select public.visitable_garden_ids())
            or f.id in (select flower_id from public.shares where to_user = auth.uid())
          )
      )
    )
  );

-- ───────── 공유받은 소리: 받을지 내가 고른다 ─────────
alter table public.shares add column if not exists status text;
alter table public.shares add column if not exists responded_at timestamptz;
update public.shares set status = 'accepted' where status is null; -- 지금까지의 공유는 받은 것으로
alter table public.shares alter column status set default 'pending';
alter table public.shares alter column status set not null;
do $$
begin
  alter table public.shares add constraint shares_status_check check (status in ('pending', 'accepted', 'declined'));
exception when duplicate_object then null;
end $$;

create or replace function public.respond_share(p_share_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.shares
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_share_id and to_user = auth.uid();
  if not found then raise exception 'SHARE_NOT_FOUND'; end if;
end $$;
revoke all on function public.respond_share(uuid, boolean) from public, anon;
grant execute on function public.respond_share(uuid, boolean) to authenticated;


-- ───────── (migrations-006) 놀러 가기: 친구 정원 = 친구가 받아서 심은 소리 ─────────
create or replace function public.visit_flowers(p_friend uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(f) || jsonb_build_object('sender_name', sm.nickname, 'shared_at', s.created_at)
  from public.shares s
  join public.flowers f on f.id = s.flower_id
  left join public.members sm on sm.id = f.sender_id
  where s.to_user = p_friend
    and s.status = 'accepted'
    and p_friend in (select public.my_friend_ids())
    and exists (
      select 1 from public.members m join public.gardens g on g.id = m.garden_id
      where m.user_id = p_friend and g.is_public
    )
  order by s.created_at
$$;
revoke all on function public.visit_flowers(uuid) from public, anon;
grant execute on function public.visit_flowers(uuid) to authenticated;

-- 놀러 간 정원에 핀 소리의 id (소리 파일 재생 권한용)
create or replace function public.visitable_flower_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.flower_id from public.shares s
  where s.status = 'accepted'
    and s.to_user in (select public.my_friend_ids())
    and exists (
      select 1 from public.members m join public.gardens g on g.id = m.garden_id
      where m.user_id = s.to_user and g.is_public
    )
$$;
grant execute on function public.visitable_flower_ids() to authenticated;

-- 소리 파일 읽기: 05의 정책에 '놀러 간 정원에 핀 소리'를 더한다 (나머지 조건은 05와 같다)
drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (
    bucket_id = 'sounds' and (
      (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g)
      or (storage.foldername(name))[1] in (select g::text from public.visitable_garden_ids() as g)
      or exists (
        select 1 from public.flowers f
        where f.audio_path = storage.objects.name
          and (
            f.garden_id in (select public.my_garden_ids())
            or f.garden_id in (select public.visitable_garden_ids())
            or f.id in (select flower_id from public.shares where to_user = auth.uid())
            or f.id in (select public.visitable_flower_ids())
          )
      )
    )
  );
