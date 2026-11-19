-- =========================================================
-- 迁移 002：菜品图片支持
-- 适用场景：已经执行过 supabase/schema.sql 的旧项目，
--           在 SQL Editor 中再执行本文件即可。
-- 内容：
--   1. dishes 表新增 image_url 字段
--   2. 创建公共读存储桶 dish-images
--   3. 放开 dish-images 的读写策略（与业务表的宽松策略一致）
-- =========================================================

-- 1. 菜品图片列
alter table public.dishes
  add column if not exists image_url text not null default '';

-- 2. 存储桶（public = true，图片可直接通过 publicUrl 访问）
insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do nothing;

-- 3. 存储对象策略
drop policy if exists "dish images read" on storage.objects;
create policy "dish images read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'dish-images');

drop policy if exists "dish images write" on storage.objects;
create policy "dish images write" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'dish-images');

drop policy if exists "dish images update" on storage.objects;
create policy "dish images update" on storage.objects
  for update to anon, authenticated using (bucket_id = 'dish-images');

drop policy if exists "dish images delete" on storage.objects;
create policy "dish images delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'dish-images');
