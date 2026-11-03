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
    page_status           TEXT NOT NULL DEFAULT 'reading',
    teaching_round_count  INTEGER DEFAULT 0,
    created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

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

  db.exec(PAGES_STATUS_INDEX_SQL);
  db.exec(PAGES_UPDATED_INDEX_SQL);
  db.exec(PAGES_PARENT_INDEX_SQL);
};
