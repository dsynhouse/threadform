-- Two foreign keys had no covering index, which Supabase's performance linter
-- reports and which costs a sequential scan in two places that matter:
--
--   threadform_assets.owner      -> auth.users(id) on delete cascade
--     Every row access re-evaluates the owner policy, and deleting a user has
--     to find that user's assets.
--
--   threadform_workspace.project_id -> threadform_projects(id) on delete set null
--     Deleting a project has to find the workspace rows pointing at it. The
--     owner column is already covered by the primary key; project_id was not.
--
-- Both tables are small today, so these are cheap to add now and avoid a scan
-- that grows with the table later.
begin;
create index if not exists threadform_assets_owner
  on public.threadform_assets (owner);
create index if not exists threadform_workspace_project
  on public.threadform_workspace (project_id);
commit;
