-- 놀러 가기: 친구 정원에는 '친구가 받아서 심은 소리'가 핀다 (친구 자신이 보낸 소리는 친구 정원에 없다)
-- migrations-005.sql 다음에 Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- 규칙: 내 정원 = 친구들이 나에게 보내서 내가 심은(accepted) 소리.
--       그러니 친구 정원에 놀러 가면 = 그 친구가 받아서 심은 소리가 보여야 한다.
-- 그런데 받은 소리는 보낸 사람 정원(garden_id)에 저장되어 있어서, 05의 'flowers: visit public' 정책
-- (친구 정원 garden_id의 꽃)으로는 보이지 않는다. 그래서 방문용 함수를 따로 둔다.

-- 놀러 간 친구가 받아서 심은 소리 목록 (친구이고, 친구 정원이 공개일 때만)
-- 반환: 꽃 행(jsonb) + 보낸 사람 이름(sender_name) + 친구가 받은 시각(shared_at)
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
