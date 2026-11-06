-- 친구 정원으로 옮기기 (한 사람당 정원 하나)
-- 이미 schema.sql, migrations-002.sql을 실행한 프로젝트에 한 번 더 실행하세요. (여러 번 실행해도 안전)

-- 1) 친구 코드로 친구 정원에 들어간다. 지금 혼자 가꾸던 정원이 있으면 내가 보낸 꽃·나무를 함께 옮기고,
--    비게 된 예전 정원은 지운다. 이미 다른 사람과 함께하는 정원이면 옮기지 않는다.
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
