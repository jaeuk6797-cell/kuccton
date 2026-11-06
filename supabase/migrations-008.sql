-- 정원 놀러 가기: 공개/비공개 없이 친구면 누구나. 단, 모양만 구경하고 소리는 들을 수 없다.
-- migrations-006.sql, migrations-007.sql 다음에 한 번 실행하세요. (여러 번 실행해도 안전)
-- (gardens.is_public 컬럼과 set_garden_public 함수는 남아 있지만 더 이상 쓰지 않는다)

-- 놀러 간 친구 정원에 핀 소리: 친구가 받아서 심은 소리. 모양에 필요한 값만 주고
-- 소리 파일 경로(audio_path)와 꽃말(transcript)은 빼서 방문자는 들을 수 없다.
create or replace function public.visit_flowers(p_friend uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select (to_jsonb(f) - 'audio_path' - 'transcript')
         || jsonb_build_object('sender_name', sm.nickname, 'shared_at', s.created_at)
  from public.shares s
  join public.flowers f on f.id = s.flower_id
  left join public.members sm on sm.id = f.sender_id
  where s.to_user = p_friend
    and s.status = 'accepted'
    and p_friend in (select public.my_friend_ids())
  order by s.created_at
$$;
revoke all on function public.visit_flowers(uuid) from public, anon;
grant execute on function public.visit_flowers(uuid) to authenticated;

-- 공개 정원을 직접 읽던 권한은 없앤다 (방문은 위 함수로만, 소리 경로 없이)
drop policy if exists "gardens: visit public" on public.gardens;
drop policy if exists "members: visit public" on public.members;
drop policy if exists "flowers: visit public" on public.flowers;

-- 소리 파일은 내 정원 소리와 나에게 공유된 소리만 들을 수 있다 (놀러 간 정원의 소리는 제외)
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
