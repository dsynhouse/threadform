import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
);
// Model Supabase's pre-existing Storage schema, including its RLS surface.
await db.exec(`create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
  grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`);
for (const file of readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  id = "00000000-0000-4000-8000-000000000003";
await db.query("insert into auth.users values($1),($2)", [a, b]);
const login = async (id) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
};
let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log("PASS", name);
};
const design = {
  version: 1,
  name: "Account QA",
  width: 100,
  height: 100,
  objects: [],
};
const save = (expected, saveId, project = design) =>
  db.query("select public.save_threadform_project($1,$2,$3,$4) as saved", [
    id,
    saveId,
    expected,
    project,
  ]);
await test("Supabase migration applies to PostgreSQL with RLS enabled", async () => {
  const r = await db.query(
    "select relname,relrowsecurity from pg_class where relname in ('threadform_projects','threadform_revisions')",
  );
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.every((r) => r.relrowsecurity));
});
await test("Owner saves an atomic project and immutable revision", async () => {
  await login(a);
  const s = await save(0, "10000000-0000-4000-8000-000000000001");
  assert.equal(s.rows[0].saved.revision, 1);
  assert.equal(
    (
      await db.query(
        "select count(*)::integer n from public.threadform_revisions",
      )
    ).rows[0].n,
    1,
  );
});
await test("Retries are idempotent and cannot change a saved payload", async () => {
  assert.equal(
    (await save(0, "10000000-0000-4000-8000-000000000001")).rows[0].saved
      .revision,
    1,
  );
  await assert.rejects(
    save(0, "10000000-0000-4000-8000-000000000001", {
      ...design,
      name: "Different",
    }),
  );
});
await test("Stale revisions cannot replace newer work", async () => {
  await save(1, "10000000-0000-4000-8000-000000000002");
  await assert.rejects(
    save(1, "10000000-0000-4000-8000-000000000003"),
    (e) => e.code === "40001",
  );
  assert.equal(
    (await db.query("select revision from public.threadform_projects")).rows[0]
      .revision,
    2,
  );
});
await test("Another account cannot list, read, overwrite or modify revision history", async () => {
  await login(b);
  assert.equal(
    (await db.query("select * from public.threadform_projects")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.threadform_revisions")).rows.length,
    0,
  );
  await assert.rejects(
    save(2, "10000000-0000-4000-8000-000000000004"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    db.query("delete from public.threadform_revisions"),
    (e) => e.code === "42501",
  );
});
await test("Direct table writes cannot bypass the save transaction", async () => {
  await login(a);
  await assert.rejects(
    db.query("update public.threadform_projects set name='Bypass'"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    db.query(
      "insert into public.threadform_revisions select * from public.threadform_revisions",
    ),
    (e) => e.code === "42501",
  );
});
await test("Anonymous clients cannot access account data or call the save RPC", async () => {
  await db.exec("reset role; set role anon");
  await assert.rejects(
    db.query("select * from public.threadform_projects"),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    save(0, "10000000-0000-4000-8000-000000000005"),
    (e) => e.code === "42501",
  );
});
await test("Intricate projects over 400 objects save and the last workspace is remembered", async () => {
  await login(a);
  const many = {
    ...design,
    objects: Array.from({ length: 3001 }, (_, i) => ({ id: String(i) })),
  };
  const result = await save(2, "10000000-0000-4000-8000-000000000007", many);
  assert.equal(result.rows[0].saved.revision, 3);
  assert.equal(
    (await db.query("select object_count from public.threadform_projects"))
      .rows[0].object_count,
    3001,
  );
  assert.equal(
    (await db.query("select project_id from public.threadform_workspace"))
      .rows[0].project_id,
    id,
  );
});
await test("Projects remain saveable after revision 500", async () => {
  await db.exec("reset role");
  await db.query(
    "update public.threadform_projects set revision=500 where id=$1",
    [id],
  );
  await login(a);
  assert.equal(
    (await save(500, "10000000-0000-4000-8000-000000000008")).rows[0].saved
      .revision,
    501,
  );
});
await test("Original artwork metadata and private object paths reject cross-account access", async () => {
  await login(a);
  const asset = "20000000-0000-4000-8000-000000000001",
    hash = "a".repeat(64);
  await db.query(
    "insert into public.threadform_assets(id,owner,name,mime,bytes,sha256,path) values($1,$2,'art.png','image/png',123,$3,$4)",
    [asset, a, hash, a + "/" + asset],
  );
  await db.query(
    "insert into storage.objects(bucket_id,name) values('threadform-artwork',$1)",
    [a + "/" + asset],
  );
  await login(b);
  assert.equal(
    (await db.query("select * from public.threadform_assets")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('threadform-artwork',$1)",
      [a + "/attack"],
    ),
    (e) => e.code === "42501",
  );
  await assert.rejects(
    db.query(
      "insert into public.threadform_workspace(owner,project_id,updated_at) values($1,$2,1)",
      [b, id],
    ),
    (e) => e.code === "42501",
  );
});
await test("Supabase inspiration boards are private to their owner", async () => {
  await login(a);
  await db.query(
    "insert into public.threadform_references(id,owner,title,created_at) values($1,$2,'Mood study',1)",
    ["30000000-0000-4000-8000-000000000001", a],
  );
  await login(b);
  assert.equal(
    (await db.query("select * from public.threadform_references")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("delete from public.threadform_references returning id"))
      .rows.length,
    0,
  );
});
await test("Save RPC rejects missing, null, string and unsupported project versions", async () => {
  await login(a);
  for (const version of [undefined, null, "1", 2]) {
    const invalid = { ...design, version };
    await assert.rejects(save(501, crypto.randomUUID(), invalid));
  }
});
await test("Save RPC rejects non-text names and preserves revision on invalid input", async () => {
  for (const name of [123, {}, [], null])
    await assert.rejects(save(501, crypto.randomUUID(), { ...design, name }));
  assert.equal(
    (await db.query("select revision from public.threadform_projects")).rows[0]
      .revision,
    501,
  );
});
await db.close();
console.log(`${passed} PostgreSQL account isolation checks passed.`);
