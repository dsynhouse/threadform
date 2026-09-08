-- The workflow migration introduced threadform_schema_version() returning a
-- literal 2, and the assets migration that followed it did not update the
-- value. A database carrying every migration therefore still reported 2, so
-- the function could not be used to tell whether the schema was current.
-- Report the real current version and keep this in step with future migrations.
create or replace function public.threadform_schema_version()
  returns integer language sql immutable set search_path='' as $$select 3$$;
grant execute on function public.threadform_schema_version() to anon,authenticated;
