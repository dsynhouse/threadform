-- Append-only upgrade: remove obsolete editor quotas while retaining atomic
-- revisions, exact-owner RLS and a bounded request size.
begin;
alter table public.threadform_projects drop constraint threadform_projects_revision_check;
alter table public.threadform_projects add constraint threadform_projects_revision_check check (revision>=1);
alter table public.threadform_projects drop constraint threadform_projects_object_count_check;
alter table public.threadform_projects add constraint threadform_projects_object_count_check check (object_count>=0);
alter table public.threadform_revisions drop constraint threadform_revisions_revision_check;
alter table public.threadform_revisions add constraint threadform_revisions_revision_check check (revision>=1);
create table public.threadform_workspace (
  owner uuid primary key references auth.users(id) on delete cascade,
  project_id uuid references public.threadform_projects(id) on delete set null,
  updated_at bigint not null
);
alter table public.threadform_workspace enable row level security;
create policy own_workspace on public.threadform_workspace for all to authenticated
  using ((select auth.uid())=owner) with check ((select auth.uid())=owner and
    (project_id is null or exists(select 1 from public.threadform_projects p where p.id=project_id and p.owner=(select auth.uid()))));
grant select,insert,update on public.threadform_workspace to authenticated;
revoke all on public.threadform_workspace from anon;
create or replace function public.save_threadform_project(p_id uuid,p_save_id uuid,p_expected integer,p_project jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_current public.threadform_projects%rowtype;
  v_retry public.threadform_revisions%rowtype;
  v_now bigint := floor(extract(epoch from clock_timestamp())*1000);
  v_count integer;
  v_name text;
  v_revision integer;
begin
  if v_owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_id is null or p_save_id is null or p_expected is null or p_expected<0 or p_expected>=2147483647 then raise exception 'Invalid revision';end if;
  if p_project is null or jsonb_typeof(p_project)<>'object' or p_project->>'version'<>'1'
    or jsonb_typeof(p_project->'objects') is distinct from 'array' or octet_length(p_project::text)>8388608
    then raise exception 'Invalid project';end if;
  v_count := jsonb_array_length(p_project->'objects');
  v_name := btrim(p_project->>'name');
  if v_count<0 or v_name is null or length(v_name)<1 or length(v_name)>100 then raise exception 'Invalid project';end if;
  -- Serializes retries, quotas and simultaneous saves for this owner.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
  select * into v_retry from public.threadform_revisions where owner=v_owner and save_id=p_save_id;
  if found then
    if v_retry.project_id<>p_id or v_retry.project<>p_project then raise exception 'Save identifier reused';end if;
    return jsonb_build_object('id',p_id,'revision',v_retry.revision);
  end if;
  if (select count(*) from public.threadform_revisions where owner=v_owner and created_at>v_now-60000)>=40 then raise exception 'Save rate exceeded';end if;
  select * into v_current from public.threadform_projects where id=p_id for update;
  if found then
    if v_current.owner<>v_owner then raise exception 'Unavailable' using errcode='42501';end if;
    if v_current.revision<>p_expected then raise exception 'Save conflict' using errcode='40001';end if;
    v_revision := p_expected+1;
    update public.threadform_projects set name=v_name,revision=v_revision,object_count=v_count,project=p_project,updated_at=v_now where id=p_id and owner=v_owner;
  else
    if p_expected<>0 then raise exception 'Save conflict' using errcode='40001';end if;
    v_revision := 1;
    insert into public.threadform_projects values(p_id,v_owner,v_name,v_revision,v_count,p_project,v_now);
  end if;
  insert into public.threadform_revisions values(p_id,v_owner,v_revision,p_save_id,p_project,v_now);
  insert into public.threadform_workspace(owner,project_id,updated_at) values(v_owner,p_id,v_now) on conflict(owner) do update set project_id=excluded.project_id,updated_at=excluded.updated_at;
  return jsonb_build_object('id',p_id,'revision',v_revision);
end;
$$;
revoke all on function public.save_threadform_project(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_threadform_project(uuid,uuid,integer,jsonb) to authenticated;
create function public.threadform_schema_version() returns integer language sql immutable set search_path='' as $$select 2$$;
grant execute on function public.threadform_schema_version() to anon,authenticated;
commit;
