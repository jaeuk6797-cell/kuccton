-- 프로필: 닉네임 바꾸기와 프로필 사진
-- migrations-008.sql 다음에 Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- members에는 수정(update) 정책이 없어서 닉네임을 바꿀 수 없었다. 함수로만 바꾸게 한다.
-- 프로필 사진은 공개 버킷 avatars/<내 user id>/... 에 올리고, 그 주소를 members.avatar_url에 둔다.

alter table public.members add column if not exists avatar_url text;

-- 내 닉네임·사진 바꾸기 (내 members 행 전부). p_avatar_url: null이면 그대로, ''이면 사진 지우기
create or replace function public.update_profile(p_nickname text, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(p_nickname, ''));
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(n) < 1 or char_length(n) > 12 then raise exception 'BAD_NICKNAME'; end if;
  update public.members
     set nickname = n,
         avatar_url = case when p_avatar_url is null then avatar_url
                           when p_avatar_url = '' then null
                           else p_avatar_url end
   where user_id = auth.uid();
end $$;
revoke all on function public.update_profile(text, text) from public, anon;
grant execute on function public.update_profile(text, text) to authenticated;

-- 친구 목록에 프로필 사진도 함께 (반환 모양이 바뀌어 다시 만든다. 나머지는 05와 같다)
drop function if exists public.my_friends();
create function public.my_friends()
returns table (user_id uuid, member_id uuid, nickname text, since timestamptz, garden_id uuid, is_public boolean, avatar_url text)
language sql stable security definer set search_path = public as $$
  select f.uid, m.id, m.nickname, f.since, m.garden_id, g.is_public, m.avatar_url
  from (
    select case when user_a = auth.uid() then user_b else user_a end as uid, created_at as since
    from public.friendships where auth.uid() in (user_a, user_b)
  ) f
  join lateral (
    select id, nickname, garden_id, avatar_url from public.members where members.user_id = f.uid order by created_at desc limit 1
  ) m on true
  join public.gardens g on g.id = m.garden_id
  order by f.since
$$;
revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated;

-- 프로필 사진 버킷: 누구나 볼 수 있고, 내 폴더(avatars/<내 user id>/)에만 올리고 지울 수 있다
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

drop policy if exists "avatars: own upload" on storage.objects;
create policy "avatars: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: own delete" on storage.objects;
create policy "avatars: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
