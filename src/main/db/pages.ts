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
          ...(('suggest_close' in entry && entry.suggest_close === true) ||
          ('suggestClose' in entry && entry.suggestClose === true)
            ? { suggestClose: true }
            : {}),
          ...('requestId' in entry && typeof entry.requestId === 'string'
            ? { requestId: entry.requestId }
            : {}),
          ...('createdAt' in entry && typeof entry.createdAt === 'number'
            ? { createdAt: entry.createdAt }
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
  private readonly listRecentReadingStatement;
  private readonly updateLogStatement;
  private readonly updateLogAndRoundStatement;
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
    this.listRecentReadingStatement = this.db.prepare(`
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
      WHERE page_status = 'reading'
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `);
    this.updateLogStatement = this.db.prepare(`
      UPDATE pages
      SET companion_log = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    this.updateLogAndRoundStatement = this.db.prepare(`
      UPDATE pages
      SET companion_log = ?, teaching_round_count = ?, updated_at = CURRENT_TIMESTAMP
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

  listRecentReading(limit: number): PageSnapshot[] {
    const rows = this.listRecentReadingStatement.all(
      limit,
    ) as unknown as PageRow[];
    return rows.map(mapPageRow);
  }

  beginTeacherTurn(
    pageId: number,
    userText: string,
    requestId: string,
  ): PageSnapshot | null {
    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return null;
      }

      if (page.messages.some((message) => message.requestId === requestId)) {
        return page;
      }

      const messages: PageMessageSnapshot[] = [
        ...page.messages,
        {
          role: 'user',
          text: userText,
          requestId,
          createdAt: Date.now(),
        },
      ];

      this.updateLogStatement.run(JSON.stringify(messages), pageId);
      return this.findById(pageId);
    });
  }

  completeTeacherTurn(
    pageId: number,
    reply: string,
    suggestClose: boolean,
    requestId: string,
  ): PageSnapshot | null {
    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return null;
      }

      if (
        page.messages.some(
          (message) =>
            message.role === 'teacher' && message.requestId === requestId,
        )
      ) {
        return page;
      }

      const messages: PageMessageSnapshot[] = [
        ...page.messages,
        {
          role: 'teacher',
          text: reply,
          suggestClose,
          requestId,
          createdAt: Date.now(),
        },
      ];
      const nextRoundCount = page.teachingRoundCount + 1;

      this.updateLogAndRoundStatement.run(
        JSON.stringify(messages),
        nextRoundCount,
        pageId,
      );
      return this.findById(pageId);
    });
  }

  private withTransaction<T>(operation: () => T): T {
    this.db.exec('BEGIN');

    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
