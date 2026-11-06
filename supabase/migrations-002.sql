-- 이미 schema.sql을 실행한 프로젝트에 한 번 더 실행하세요. (여러 번 실행해도 안전)

-- 1) 스토리지 정책 수정: 정원 폴더에 업로드/재생 허용
insert into storage.buckets (id, name, public) values ('sounds', 'sounds', false)
on conflict (id) do nothing;

drop policy if exists "sounds: garden read" on storage.objects;
create policy "sounds: garden read" on storage.objects for select to authenticated
  using (bucket_id = 'sounds' and (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g));

drop policy if exists "sounds: garden upload" on storage.objects;
create policy "sounds: garden upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and (storage.foldername(name))[1] in (select g::text from public.my_garden_ids() as g));

-- 2) 브랜치 통합: 꽃잎별 길이(파형 윤곽)
alter table public.flowers add column if not exists lengths real[];
