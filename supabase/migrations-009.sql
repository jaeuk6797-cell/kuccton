-- 소리 도착 푸시 알림 (웹 푸시). 친구가 소리를 보내면(shares에 새 행) 받는 사람의 기기로 알림을 보낸다.
-- migrations-008.sql 다음에 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- 흐름: 앱에서 알림 켜기 → push_subscriptions에 이 기기 주소 저장
--       → shares insert 트리거가 Edge Function(notify-share)을 부름 → 함수가 웹 푸시 발송
--
-- 실행 전에 Vault에 비밀값 두 개를 넣어 두세요 (SQL Editor에서 한 번):
--   select vault.create_secret('https://<프로젝트 ref>.supabase.co', 'project_url');
--   select vault.create_secret('<아무 긴 무작위 문자열>', 'push_secret');   -- Edge Function의 PUSH_SECRET과 같은 값
-- 비밀값이 없으면 알림만 건너뛰고 소리 보내기는 그대로 된다.

create extension if not exists pg_net with schema extensions;

-- 기기별 웹 푸시 구독. endpoint가 기기(브라우저)마다 하나라서 기본키로 쓴다.
-- 같은 기기에서 다른 계정으로 로그인해 알림을 켜면 그 계정으로 넘어간다.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
-- 앱이 직접 읽고 쓰는 정책은 두지 않는다. 저장·삭제는 아래 함수로만, 발송은 Edge Function이 service role로 읽는다.

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- 소리가 공유되면 Edge Function을 비동기로 부른다 (pg_net: 소리 보내기를 기다리게 하지 않음).
-- 알림이 실패해도 공유는 막지 않는다.
create or replace function public.notify_share_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.to_user) then
    return new; -- 알림을 켠 기기가 없으면 부르지 않는다
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/notify-share',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('share_id', new.id)
  );
  return new;
exception when others then
  raise warning 'notify_share_push: %', sqlerrm;
  return new;
end $$;

drop trigger if exists shares_push on public.shares;
create trigger shares_push after insert on public.shares
  for each row execute function public.notify_share_push();
