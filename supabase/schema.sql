-- =========================================================
-- 家宴 · 家庭点菜 App · Supabase 初始化脚本
-- 使用方式：
--   1. 在 https://supabase.com 新建项目
--   2. 打开 SQL Editor，粘贴并执行本文件
--   3. Authentication → Providers → 开启 Anonymous sign-ins
--   4. Project Settings → API 里复制 Project URL 与 anon public key，
--      填入 js/config.js 的 SUPABASE_URL / SUPABASE_ANON_KEY
-- =========================================================

create extension if not exists pgcrypto;

-- 家庭
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

-- 成员
create table if not exists public.members (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families(id) on delete cascade,
  user_id        uuid,
  nickname       text not null,
  avatar         text default '🧑',
  phone          text default '',
  role           text not null default 'member' check (role in ('admin', 'cook', 'member')),
  allergies      jsonb not null default '[]'::jsonb,
  taste_tags     jsonb not null default '[]'::jsonb,
  disliked_foods jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists members_family_idx on public.members(family_id);
create index if not exists members_user_idx on public.members(user_id);

-- 菜品
create table if not exists public.dishes (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null,
  category     text not null default '荤菜',
  ingredients  jsonb not null default '[]'::jsonb,
  steps        text default '',
  difficulty   text not null default '简单' check (difficulty in ('简单', '中等', '复杂')),
  duration_min int not null default 0,
  taste_tags   jsonb not null default '[]'::jsonb,
  links        jsonb not null default '[]'::jsonb,
  image_url    text not null default '',
  favorite_by  jsonb not null default '[]'::jsonb,
  cooked_count int not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists dishes_family_idx on public.dishes(family_id);

-- 菜单安排
create table if not exists public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families(id) on delete cascade,
  date           date not null,
  meal           text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  dish_id        uuid not null references public.dishes(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'confirmed', 'done')),
  cook_member_id uuid,
  votes          jsonb not null default '[]'::jsonb,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists menu_items_family_date_idx on public.menu_items(family_id, date);

-- 采购清单
create table if not exists public.shopping_items (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families(id) on delete cascade,
  ingredient     text not null,
  amount         text default '',
  from_dish_id   uuid,
  from_dish_name text default '',
  checked        boolean not null default false,
  manual         boolean not null default false,
  updated_at     timestamptz not null default now()
);
create index if not exists shopping_family_idx on public.shopping_items(family_id);

-- 评分
create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references public.families(id) on delete cascade,
  dish_id    uuid not null references public.dishes(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  score      int not null check (score between 1 and 5),
  comment    text default '',
  created_at timestamptz not null default now(),
  unique (dish_id, member_id)
);
create index if not exists ratings_family_idx on public.ratings(family_id);

-- ---------------------------------------------------------
-- 行级权限
-- 家庭内数据按 family_id 隔离；MVP 采用宽松策略，
-- 生产环境建议改为基于 auth.uid() 与 members 表的严格策略。
-- ---------------------------------------------------------
alter table public.families      enable row level security;
alter table public.members       enable row level security;
alter table public.dishes        enable row level security;
alter table public.menu_items    enable row level security;
alter table public.shopping_items enable row level security;
alter table public.ratings       enable row level security;

drop policy if exists "app access" on public.families;
create policy "app access" on public.families
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "app access" on public.members;
create policy "app access" on public.members
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "app access" on public.dishes;
create policy "app access" on public.dishes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "app access" on public.menu_items;
create policy "app access" on public.menu_items
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "app access" on public.shopping_items;
create policy "app access" on public.shopping_items
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "app access" on public.ratings;
create policy "app access" on public.ratings
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------
-- 实时同步：把业务表加入 Realtime Publication
-- （若提示某表已在 publication 中，可忽略对应语句）
-- ---------------------------------------------------------
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.dishes;
alter publication supabase_realtime add table public.menu_items;
alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.ratings;
alter publication supabase_realtime add table public.families;

-- ---------------------------------------------------------
-- 菜品图片存储桶（公共读，登录用户可上传）
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do nothing;

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
