-- migrations-011.sql 다음 실행: 수신자가 자신의 수신 항목을 삭제할 수 있게 한다.
-- flowers 원본과 Storage 파일에는 삭제 권한을 추가하지 않는다.
drop policy if exists "shares: recipient delete" on public.shares;
create policy "shares: recipient delete" on public.shares for delete to authenticated
  using (to_user = auth.uid());
