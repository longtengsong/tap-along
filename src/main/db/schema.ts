import type { DatabaseSync } from 'node:sqlite';

export const PAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS pages (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_page_id        INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    edge_title            TEXT,
    title_source          TEXT,
    body                  TEXT NOT NULL,
    body_doc              TEXT,
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

export const PAGE_IMAGES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS page_images (
    id          TEXT PRIMARY KEY,
    file_name   TEXT NOT NULL,
    mime        TEXT NOT NULL,
    byte_length INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  )
`;

export const PAGE_IMAGES_CREATED_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_page_images_created
  ON page_images(created_at)
`;

export const PAGE_IMAGE_REFS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS page_image_refs (
    page_id  INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    image_id TEXT NOT NULL REFERENCES page_images(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, image_id)
  )
`;

export const PAGE_IMAGE_REFS_IMAGE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_page_image_refs_image
  ON page_image_refs(image_id)
`;

export const PAGES_FTS_TABLE_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
    body,
    source,
    tokenize = 'trigram'
  )
`;

export const FTS_INDEX_VERSION = 1;

export const REQUEST_INSPECTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS request_inspections (
    request_id     TEXT PRIMARY KEY,
    status         TEXT NOT NULL,
    provider_id    TEXT,
    model          TEXT,
    messages       TEXT NOT NULL,
    error_code     TEXT,
    reply          TEXT,
    latency_ms     INTEGER,
    prompt_version TEXT,
    prompt_hash    TEXT,
    temperature    REAL,
    created_at     INTEGER NOT NULL
  )
`;

const REQUEST_INSPECTION_COLUMNS: ReadonlyArray<
  readonly [name: string, type: string]
> = [
  ['reply', 'TEXT'],
  ['latency_ms', 'INTEGER'],
  ['prompt_version', 'TEXT'],
  ['prompt_hash', 'TEXT'],
  ['temperature', 'REAL'],
];

export const REQUEST_INSPECTIONS_CREATED_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_request_inspections_created
  ON request_inspections(created_at DESC)
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

const ensureRequestInspectionColumns = (db: DatabaseSync) => {
  const columns = db
    .prepare("PRAGMA table_info('request_inspections')")
    .all()
    .map((row) => String(row.name));

  for (const [name, type] of REQUEST_INSPECTION_COLUMNS) {
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE request_inspections ADD COLUMN ${name} ${type}`);
    }
  }
};

export const initializeSchema = (db: DatabaseSync) => {
  db.exec(PAGES_TABLE_SQL);
  db.exec(PAGE_IMAGES_TABLE_SQL);
  db.exec(PAGE_IMAGES_CREATED_INDEX_SQL);
  db.exec(PAGE_IMAGE_REFS_TABLE_SQL);
  db.exec(PAGE_IMAGE_REFS_IMAGE_INDEX_SQL);
  db.exec(REQUEST_INSPECTIONS_TABLE_SQL);
  db.exec(REQUEST_INSPECTIONS_CREATED_INDEX_SQL);
  ensureRequestInspectionColumns(db);

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

  if (!columns.includes('title_source')) {
    db.exec('ALTER TABLE pages ADD COLUMN title_source TEXT');
  }

  if (!columns.includes('body_doc')) {
    db.exec('ALTER TABLE pages ADD COLUMN body_doc TEXT');
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
