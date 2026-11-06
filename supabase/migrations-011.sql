-- migrations-010.sql 다음 실행: 내역에서 거절·정리한 소리를 다시 심기.
-- 정원 50송이 제한과 수신자 본인만 응답할 수 있는 규칙은 유지한다.
create or replace function public.respond_share(p_share_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'SHARE_NOT_FOUND'; end if;
  -- 같은 정원에서 동시에 심더라도 50송이를 넘지 않도록 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended('sup-garden:' || auth.uid()::text, 0));
  if p_accept and (
    select count(*) from public.shares where to_user = auth.uid() and status = 'accepted'
  ) >= 50 then
    raise exception 'GARDEN_FULL_50';
  end if;
  update public.shares
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_share_id and to_user = auth.uid()
    and (status = 'pending' or (p_accept and status in ('declined', 'archived')));
  if not found then raise exception 'SHARE_NOT_FOUND'; end if;
end $$;
revoke all on function public.respond_share(uuid, boolean) from public, anon;
grant execute on function public.respond_share(uuid, boolean) to authenticated;
