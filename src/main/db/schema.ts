import type { DatabaseSync } from 'node:sqlite';

export const PAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS pages (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_page_id        INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    edge_title            TEXT,
    body                  TEXT NOT NULL,
    source                TEXT,
    parse_status          TEXT NOT NULL DEFAULT 'pending',
    companion_log         TEXT,
    guidance              TEXT,
    page_status           TEXT NOT NULL DEFAULT 'reading',
    teaching_round_count  INTEGER DEFAULT 0,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export const PAGES_FTS_TABLE_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    body,
    source,
    tokenize = 'trigram'
  )
`;

export const FTS_INDEX_VERSION = 1;

export const PAGES_STATUS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(page_status)
`;

export const PAGES_UPDATED_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at DESC)
`;

export const PAGES_PARENT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_page_id)
`;

export const initializeSchema = (db: DatabaseSync) => {
  db.exec(PAGES_TABLE_SQL);

  const columns = db
    .prepare("PRAGMA table_info('pages')")
    .all()
    .map((row) => row.name);

  if (!columns.includes('parent_page_id')) {
    db.exec(`
      ALTER TABLE pages
      ADD COLUMN parent_page_id INTEGER
        REFERENCES pages(id) ON DELETE CASCADE
    `);
  }

  if (!columns.includes('guidance')) {
    db.exec('ALTER TABLE pages ADD COLUMN guidance TEXT');
  }

  db.exec(PAGES_STATUS_INDEX_SQL);
  db.exec(PAGES_UPDATED_INDEX_SQL);
  db.exec(PAGES_PARENT_INDEX_SQL);
  db.exec(PAGES_FTS_TABLE_SQL);

  const pageCount = Number(
    (
      db.prepare('SELECT COUNT(*) AS count FROM pages').get() as {
        count: number;
      }
    ).count,
  );
  const ftsCount = Number(
    (
      db.prepare('SELECT COUNT(*) AS count FROM pages_fts').get() as {
        count: number;
      }
    ).count,
  );
  const userVersion = Number(
    (db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version,
  );

  if (userVersion < FTS_INDEX_VERSION || pageCount !== ftsCount) {
    db.exec('DELETE FROM pages_fts');
    db.exec(`
      INSERT INTO pages_fts(rowid, body, source)
      SELECT id, body, COALESCE(source, '') FROM pages
    `);
    db.exec(`PRAGMA user_version = ${FTS_INDEX_VERSION}`);
  }
};
