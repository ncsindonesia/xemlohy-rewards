-- =====================================================================
-- Xemlohy Smart Rewards - photo storage for counterfeit reports
-- Run once, after 01_schema.sql. Creates a PRIVATE bucket: anyone can
-- upload a report photo (max 5 MB, images only); only NCS staff can view.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

drop policy if exists "report photos upload" on storage.objects;
create policy "report photos upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'reports');

drop policy if exists "report photos staff read" on storage.objects;
create policy "report photos staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and public.is_staff());
