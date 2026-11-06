-- 소리 도착 웹 푸시. README의 Edge Function·Vault 설정도 함께 적용해야 한다.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
-- 엔드포인트와 암호화 키는 인증된 Edge Function만 읽고 쓴다.
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

create or replace function public.notify_sound_arrived()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  function_url text;
  hook_secret text;
begin
  if new.status <> 'pending' then return new; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'sup_push_function_url' limit 1;
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'sup_push_hook_secret' limit 1;
  -- 서버 설정 전에는 공유를 방해하지 않고 푸시만 건너뛴다.
  if function_url is null or hook_secret is null then return new; end if;
  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sup-push-secret', hook_secret),
    body := jsonb_build_object('action', 'deliver', 'shareId', new.id),
    timeout_milliseconds := 15000
  );
  return new;
exception when others then
  -- 푸시 서버의 장애가 원래 소리 공유를 롤백하지 않도록 한다.
  raise warning 'SUP 푸시 요청을 예약하지 못했습니다 (SQLSTATE %)', sqlstate;
  return new;
end;
$$;
revoke all on function public.notify_sound_arrived() from public, anon, authenticated;
drop trigger if exists sup_sound_arrived_push on public.shares;
create trigger sup_sound_arrived_push after insert on public.shares
  for each row execute function public.notify_sound_arrived();
