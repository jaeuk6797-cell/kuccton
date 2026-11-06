-- 정원 공개/비공개, 친구 정원 방문, 공유받은 소리 받기/거절
-- migrations-004.sql 다음에 한 번 실행하세요. (여러 번 실행해도 안전)

-- ───────── 정원 공개 여부 (기본 비공개) ─────────
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
