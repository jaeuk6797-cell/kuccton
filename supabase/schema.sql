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
