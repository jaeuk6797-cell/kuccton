-- 친구와 대화하기
-- migrations-006.sql 다음에 한 번 실행하세요. (여러 번 실행해도 안전)
-- 대화창에는 이 메시지와 소리 공유(shares)가 시간순으로 함께 보인다.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid(),
  to_user uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_pair_idx on public.messages (from_user, to_user, created_at);
create index if not exists messages_to_idx on public.messages (to_user, created_at);
alter table public.messages enable row level security;

drop policy if exists "messages: mine read" on public.messages;
create policy "messages: mine read" on public.messages for select to authenticated
  using (auth.uid() in (from_user, to_user));

drop policy if exists "messages: send to friend" on public.messages;
create policy "messages: send to friend" on public.messages for insert to authenticated
  with check (from_user = auth.uid() and to_user in (select public.my_friend_ids()));

do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
end $$;
