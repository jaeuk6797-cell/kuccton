-- 친구 맺기와 소리 공유 (각자 자기 정원 + 여러 친구)
-- schema.sql, migrations-002.sql, migrations-003.sql 다음에 한 번 실행하세요. (여러 번 실행해도 안전)

-- ───────── 친구 관계 (서로 친구, 한 쌍에 한 줄) ─────────
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
