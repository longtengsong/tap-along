import type { DatabaseSync } from 'node:sqlite';
import type {
  PageLifecycleStatus,
  PageMessageRole,
  PageMessageSnapshot,
  PageSnapshot,
  ParseStatus,
} from '../../shared/pages.ts';

interface PageRow {
  id: number;
  edge_title: string | null;
  body: string;
  source: string | null;
  parse_status: ParseStatus;
  companion_log: string | null;
  page_status: PageLifecycleStatus;
  teaching_round_count: number;
}

const MESSAGE_ROLES = new Set<PageMessageRole>([
  'teacher',
  'user',
  'maintenance',
]);

const PAGE_STATUSES = new Set<PageLifecycleStatus>(['reading', 'closed']);

const PARSE_STATUSES = new Set<ParseStatus>([
  'pending',
  'reading',
  'done',
  'failed',
]);

export const deriveFallbackTitle = (body: string) => {
  const firstLine = body.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine.slice(0, 12) || '未命名';
};

const parseMessages = (rawLog: string | null): PageMessageSnapshot[] => {
  if (!rawLog) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawLog);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        !('role' in entry) ||
        !('text' in entry) ||
        !MESSAGE_ROLES.has(entry.role as PageMessageRole) ||
        typeof entry.text !== 'string'
      ) {
        return [];
      }

      return [
        {
          role: entry.role as PageMessageRole,
          text: entry.text,
          ...('suggest_close' in entry && entry.suggest_close === true
            ? { suggestClose: true }
            : {}),
        },
      ];
    });
  } catch {
    return [];
  }
};

const mapPageRow = (row: PageRow): PageSnapshot => ({
  id: row.id,
  title: row.edge_title?.trim() || deriveFallbackTitle(row.body),
  body: row.body,
  source: row.source ?? '',
  status: PAGE_STATUSES.has(row.page_status) ? row.page_status : 'reading',
  parseStatus: PARSE_STATUSES.has(row.parse_status)
    ? row.parse_status
    : 'pending',
  teachingRoundCount: row.teaching_round_count,
  messages: parseMessages(row.companion_log),
});

export class PagesRepository {
  private readonly insertStatement;
  private readonly findStatement;
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.insertStatement = this.db.prepare(`
      INSERT INTO pages (body, source, parse_status, page_status)
      VALUES (?, ?, 'pending', 'reading')
    `);
    this.findStatement = this.db.prepare(`
      SELECT
        id,
        edge_title,
        body,
        source,
        parse_status,
        companion_log,
        page_status,
        teaching_round_count
      FROM pages
      WHERE id = ?
    `);
  }

  create(body: string, source: string): PageSnapshot {
    const result = this.insertStatement.run(body, source || null);
    const page = this.findById(Number(result.lastInsertRowid));

    if (!page) {
      throw new Error('新页边写入后无法读取');
    }

    return page;
  }

  findById(pageId: number): PageSnapshot | null {
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return null;
    }

    const row = this.findStatement.get(pageId) as PageRow | undefined;
    return row ? mapPageRow(row) : null;
  }
}
