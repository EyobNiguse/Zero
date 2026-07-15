/**
 * Versioned migrations for the local browser database.
 *
 * We can't use drizzle-kit's filesystem migrator in the browser, so migrations
 * are a plain ordered list applied against `PRAGMA user_version`. Each entry is
 * an array of statements applied atomically; after entry N (0-indexed) succeeds
 * `user_version` becomes N+1. Never edit or reorder a shipped entry — only
 * append. Entry 0 mirrors the server baseline
 * apps/server/src/routes/agent/db/drizzle/0000_*.sql (minus latest_label_ids,
 * which the Drizzle schema does not declare).
 */

/** Minimal shape of the raw sqlite-wasm handle we depend on. */
export interface RawSqlite {
  exec(opts: {
    sql: string;
    bind?: unknown[];
    returnValue?: 'resultRows';
    rowMode?: 'array';
  }): unknown[][];
  exec(sql: string): unknown;
}

export const MIGRATIONS: string[][] = [
  // 0000 — baseline: threads / labels / thread_labels
  [
    `CREATE TABLE labels (
       id text PRIMARY KEY NOT NULL,
       name text NOT NULL,
       color text NOT NULL
     )`,
    `CREATE INDEX labels_name_idx ON labels (name)`,
    `CREATE TABLE threads (
       id text PRIMARY KEY NOT NULL,
       thread_id text NOT NULL,
       provider_id text NOT NULL,
       latest_sender text,
       latest_received_on text,
       latest_subject text
     )`,
    `CREATE INDEX threads_thread_id_idx ON threads (thread_id)`,
    `CREATE INDEX threads_provider_id_idx ON threads (provider_id)`,
    `CREATE INDEX threads_latest_received_on_idx ON threads (latest_received_on)`,
    `CREATE INDEX threads_latest_subject_idx ON threads (latest_subject)`,
    `CREATE INDEX threads_latest_sender_idx ON threads (latest_sender)`,
    `CREATE TABLE thread_labels (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       thread_id text NOT NULL,
       label_id text NOT NULL,
       FOREIGN KEY (thread_id) REFERENCES threads(id) ON UPDATE no action ON DELETE cascade,
       FOREIGN KEY (label_id) REFERENCES labels(id) ON UPDATE no action ON DELETE cascade
     )`,
    `CREATE INDEX thread_labels_thread_id_idx ON thread_labels (thread_id)`,
    `CREATE INDEX thread_labels_label_id_idx ON thread_labels (label_id)`,
    `CREATE INDEX thread_labels_thread_label_idx ON thread_labels (thread_id, label_id)`,
    `CREATE UNIQUE INDEX thread_labels_thread_id_label_id_unique ON thread_labels (thread_id, label_id)`,
  ],
  // 0001 — full receive: per-message bodies + attachment metadata.
  [
    `CREATE TABLE messages (
       id text PRIMARY KEY NOT NULL,
       thread_id text NOT NULL,
       provider_id text NOT NULL,
       sender text,
       to_recipients text,
       cc_recipients text,
       subject text,
       snippet text,
       body_html text,
       body_text text,
       received_on text,
       has_attachments integer DEFAULT 0 NOT NULL,
       FOREIGN KEY (thread_id) REFERENCES threads(id) ON UPDATE no action ON DELETE cascade
     )`,
    `CREATE INDEX messages_thread_id_idx ON messages (thread_id)`,
    `CREATE INDEX messages_received_on_idx ON messages (received_on)`,
    `CREATE TABLE attachments (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       message_id text NOT NULL,
       attachment_id text NOT NULL,
       filename text,
       mime_type text,
       size integer,
       inline integer DEFAULT 0 NOT NULL,
       content_id text,
       FOREIGN KEY (message_id) REFERENCES messages(id) ON UPDATE no action ON DELETE cascade
     )`,
    `CREATE INDEX attachments_message_id_idx ON attachments (message_id)`,
    `CREATE UNIQUE INDEX attachments_message_id_attachment_id_unique ON attachments (message_id, attachment_id)`,
  ],
  // 0002 — folder tree + persisted sync cursors.
  [
    `CREATE TABLE folders (
       id text PRIMARY KEY NOT NULL,
       provider_id text NOT NULL,
       name text NOT NULL,
       role text,
       parent_id text,
       unread integer,
       total integer,
       delta_cursor text,
       synced_at text
     )`,
    `CREATE INDEX folders_provider_id_idx ON folders (provider_id)`,
    `CREATE INDEX folders_role_idx ON folders (role)`,
    `CREATE INDEX folders_parent_id_idx ON folders (parent_id)`,
    `CREATE TABLE sync_state (
       scope text PRIMARY KEY NOT NULL,
       provider_id text NOT NULL,
       cursor text,
       synced_at text
     )`,
  ],

  // 0003 — conversation size, so a list row can show [N] without fetching the thread
  [`ALTER TABLE threads ADD COLUMN reply_count integer`],

  // 0004 — cached attachment bytes (base64), so an opened attachment survives going offline
  [`ALTER TABLE attachments ADD COLUMN body text`],

  // 0005 — outbox: local-first drafts and queued sends, drained by ../rpc/outbox
  [
    `CREATE TABLE outbox (
       id text PRIMARY KEY NOT NULL,
       provider_id text NOT NULL,
       kind text NOT NULL,
       status text NOT NULL,
       remote_id text,
       thread_id text,
       payload text NOT NULL,
       dirty integer DEFAULT 1 NOT NULL,
       attempts integer DEFAULT 0 NOT NULL,
       last_error text,
       send_after integer,
       created_at text NOT NULL,
       updated_at text NOT NULL
     )`,
    `CREATE INDEX outbox_status_idx ON outbox (status)`,
    `CREATE INDEX outbox_provider_id_idx ON outbox (provider_id)`,
    `CREATE INDEX outbox_updated_at_idx ON outbox (updated_at)`,
  ],
];

function currentVersion(raw: RawSqlite): number {
  const rows = raw.exec({ sql: 'PRAGMA user_version', returnValue: 'resultRows', rowMode: 'array' });
  return Number(rows?.[0]?.[0] ?? 0);
}

/**
 * Apply every migration newer than the DB's current `user_version`. Idempotent:
 * a DB already at the latest version is a no-op. Each migration runs in its own
 * transaction; a failure rolls that migration back and aborts.
 */
export function runMigrations(raw: RawSqlite): { from: number; to: number } {
  const from = currentVersion(raw);

  for (let i = from; i < MIGRATIONS.length; i++) {
    raw.exec('BEGIN');
    try {
      for (const stmt of MIGRATIONS[i]) raw.exec(stmt);
      // user_version only accepts a literal — i is a trusted loop index.
      raw.exec(`PRAGMA user_version = ${i + 1}`);
      raw.exec('COMMIT');
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  }

  return { from, to: MIGRATIONS.length };
}
