-- 정원은 50송이까지: 가득 차면 새 소리를 심을 수 없고, 스스로 정리(정원에서 빼기)한다
-- migrations-008.sql 다음에 한 번 실행하세요. (여러 번 실행해도 안전)

-- 공유 상태에 'archived'(정원에서 뺌, 앨범에는 남음)를 더한다
alter table public.shares drop constraint if exists shares_status_check;
alter table public.shares add constraint shares_status_check
  check (status in ('pending', 'accepted', 'declined', 'archived'));

-- 받기: 정원에 이미 50송이가 심겨 있으면 막는다
create or replace function public.respond_share(p_share_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept and (
    select count(*) from public.shares where to_user = auth.uid() and status = 'accepted'
  ) >= 50 then
    raise exception 'GARDEN_FULL_50';
  end if;
  update public.shares
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_share_id and to_user = auth.uid() and status = 'pending';
  if not found then raise exception 'SHARE_NOT_FOUND'; end if;
end $$;
revoke all on function public.respond_share(uuid, boolean) from public, anon;
grant execute on function public.respond_share(uuid, boolean) to authenticated;

-- 정원 정리: 심은 소리를 정원에서 뺀다 (지우지 않고 앨범에 남는다)
create or replace function public.archive_shares(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.shares set status = 'archived', responded_at = now()
  where id = any(p_ids) and to_user = auth.uid() and status = 'accepted';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.archive_shares(uuid[]) from public, anon;
grant execute on function public.archive_shares(uuid[]) to authenticated;
