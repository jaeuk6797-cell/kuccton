-- 스토리지 정책 수정: 정원 폴더에 업로드/재생 허용
insert into storage.buckets (id, name, public) values ('sounds', 'sounds', false)
on conflict (id) do nothing;

drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (bucket_id = 'sounds' and (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g));

drop policy if exists "sounds: garden upload" on storage.objects;
create policy "sounds: garden upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g));
