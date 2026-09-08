-- Account persistence. Apply once to the selected Supabase project.
-- Guest projects remain in their existing private D1/R2 studios.
begin;
create table public.threadform_projects (
  id uuid primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 100),
  revision integer not null check(revision between 1 and 500),
  object_count integer not null check(object_count between 0 and 400),
  project jsonb not null check(octet_length(project::text)<=8388608 and project->>'version'='1'),
  updated_at bigint not null
);
create index threadform_projects_owner_updated on public.threadform_projects(owner,updated_at desc,id);
create table public.threadform_revisions (
  project_id uuid not null references public.threadform_projects(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  revision integer not null check(revision between 1 and 500),
  save_id uuid not null,
  project jsonb not null check(octet_length(project::text)<=8388608),
  created_at bigint not null,
  primary key(project_id,revision),
  unique(owner,save_id)
);
create index threadform_revisions_owner_time on public.threadform_revisions(owner,created_at);
alter table public.threadform_projects enable row level security;
alter table public.threadform_revisions enable row level security;
create policy own_projects on public.threadform_projects for select to authenticated using ((select auth.uid())=owner);
create policy own_revisions on public.threadform_revisions for select to authenticated using ((select auth.uid())=owner);
revoke all on public.threadform_projects,public.threadform_revisions from anon,authenticated;
grant select on public.threadform_projects,public.threadform_revisions to authenticated;
-- Only this transaction can write. The owner is obtained from a verified JWT,
-- never from a client argument. No service-role key is needed by the app.
create function public.save_threadform_project(p_id uuid,p_save_id uuid,p_expected integer,p_project jsonb)
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
  if p_id is null or p_save_id is null or p_expected is null or p_expected<0 or p_expected>=500 then raise exception 'Invalid revision';end if;
  if p_project is null or jsonb_typeof(p_project)<>'object' or p_project->>'version'<>'1'
    or jsonb_typeof(p_project->'objects') is distinct from 'array' or octet_length(p_project::text)>8388608
    then raise exception 'Invalid project';end if;
  v_count := jsonb_array_length(p_project->'objects');
  v_name := btrim(p_project->>'name');
  if v_count>400 or v_name is null or length(v_name)<1 or length(v_name)>100 then raise exception 'Invalid project';end if;
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
    if (select count(*) from public.threadform_projects where owner=v_owner)>=200 then raise exception 'Project quota exceeded';end if;
    v_revision := 1;
    insert into public.threadform_projects values(p_id,v_owner,v_name,v_revision,v_count,p_project,v_now);
  end if;
  insert into public.threadform_revisions values(p_id,v_owner,v_revision,p_save_id,p_project,v_now);
  return jsonb_build_object('id',p_id,'revision',v_revision);
end;
$$;
revoke all on function public.save_threadform_project(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_threadform_project(uuid,uuid,integer,jsonb) to authenticated;
commit;
