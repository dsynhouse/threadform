import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const projects = sqliteTable(
  "studio_projects",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(0),
    blobKey: text("blob_key").notNull(),
    objectCount: integer("object_count").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("projects_owner_updated").on(t.owner, t.updatedAt)],
);
export const revisions = sqliteTable(
  "studio_revisions",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    blobKey: text("blob_key").notNull(),
    createdAt: integer("created_at").notNull(),
    saveId: text("save_id"),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.revision] }),
    uniqueIndex("revisions_project_save").on(t.projectId, t.saveId),
  ],
);
export const references = sqliteTable(
  "studio_references",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    notes: text("notes").notNull(),
    tags: text("tags").notNull(),
    palette: text("palette").notNull(),
    imageKey: text("image_key"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("references_owner_created").on(t.owner, t.createdAt)],
);
export const connections = sqliteTable("studio_connections", {
  owner: text("owner").primaryKey(),
  encryptedToken: text("encrypted_token").notNull(),
  expiresAt: integer("expires_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const oauthStates = sqliteTable(
  "studio_oauth_states",
  {
    state: text("state").primaryKey(),
    owner: text("owner").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("oauth_expiry").on(t.expiresAt)],
);
export const writeLimits = sqliteTable("studio_write_limits", {
  owner: text("owner").primaryKey(),
  window: integer("window").notNull(),
  count: integer("count").notNull(),
});
