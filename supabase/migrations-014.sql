-- 친구는 계정마다 최대 20명. 기존 관계는 삭제하지 않고 새 등록만 제한한다.
-- add_friend RPC와 별도로 테이블에서 검사해 다른 INSERT 경로에도 적용한다.
create index if not exists friendships_user_b_idx on public.friendships(user_b);

create or replace function public.enforce_friend_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lock_a bigint;
  lock_b bigint;
begin
  if tg_op = 'UPDATE' and new.user_a = old.user_a and new.user_b = old.user_b then
    return new;
  end if;
  -- 두 계정의 등록 요청을 같은 순서로 잠가 동시 요청의 초과 등록도 막는다.
  lock_a := pg_catalog.hashtextextended('sup-friend:' || new.user_a::text, 0);
  lock_b := pg_catalog.hashtextextended('sup-friend:' || new.user_b::text, 0);
  perform pg_catalog.pg_advisory_xact_lock(least(lock_a, lock_b));
  perform pg_catalog.pg_advisory_xact_lock(greatest(lock_a, lock_b));

  -- 이미 친구라면 기존 add_friend의 ON CONFLICT DO NOTHING 동작을 유지한다.
  if exists (select 1 from public.friendships where user_a = new.user_a and user_b = new.user_b) then
    return new;
  end if;
  if (select count(*) from public.friendships where new.user_a in (user_a, user_b) and id <> new.id) >= 20 then
    if new.user_a = auth.uid() then raise exception 'FRIEND_LIMIT_SELF'; end if;
    raise exception 'FRIEND_LIMIT_OTHER';
  end if;
  if (select count(*) from public.friendships where new.user_b in (user_a, user_b) and id <> new.id) >= 20 then
    if new.user_b = auth.uid() then raise exception 'FRIEND_LIMIT_SELF'; end if;
    raise exception 'FRIEND_LIMIT_OTHER';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_friend_limit() from public, anon, authenticated;
drop trigger if exists friendships_limit_20 on public.friendships;
create trigger friendships_limit_20 before insert or update of user_a, user_b on public.friendships
  for each row execute function public.enforce_friend_limit();
