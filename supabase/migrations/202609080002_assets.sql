begin;
create table public.threadform_assets (
  id uuid primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 255),
  mime text not null check(mime in ('image/png','image/jpeg','image/webp','image/svg+xml','application/json')),
  bytes bigint not null check(bytes between 1 and 33554432),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  path text not null unique check(path like owner::text || '/%'),
  created_at timestamptz not null default now()
);
alter table public.threadform_assets enable row level security;
create policy own_assets on public.threadform_assets for all to authenticated using ((select auth.uid())=owner) with check ((select auth.uid())=owner);
grant select,insert,delete on public.threadform_assets to authenticated;
revoke all on public.threadform_assets from anon;
create table public.threadform_references (
  id uuid primary key, owner uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 150),
  url text not null default '' check(url='' or url ~ '^https?://'),
  notes text not null default '' check(length(notes)<=3000),
  tags jsonb not null default '[]' check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=12),
  palette jsonb not null default '[]' check(jsonb_typeof(palette)='array' and jsonb_array_length(palette)<=16),
  image_path text check(image_path is null or image_path like owner::text || '/%'),
  created_at bigint not null
);
create index threadform_references_owner_time on public.threadform_references(owner,created_at desc,id);
alter table public.threadform_references enable row level security;
create policy own_references on public.threadform_references for all to authenticated using ((select auth.uid())=owner) with check ((select auth.uid())=owner);
grant select,insert,update,delete on public.threadform_references to authenticated;
revoke all on public.threadform_references from anon;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('threadform-artwork','threadform-artwork',false,33554432,array['image/png','image/jpeg','image/webp','image/svg+xml','application/json'])
 on conflict(id) do nothing;
create policy threadform_storage_read on storage.objects for select to authenticated using (bucket_id='threadform-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy threadform_storage_insert on storage.objects for insert to authenticated with check (bucket_id='threadform-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy threadform_storage_delete on storage.objects for delete to authenticated using (bucket_id='threadform-artwork' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
