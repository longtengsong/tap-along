import type { DatabaseSync } from 'node:sqlite';
import type {
  PageActionType,
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

interface OpeningMessage {
  text: string;
  requestId: string;
}

export interface ClosedDescendantBody {
  pageId: number;
  body: string;
  depth: number;
}

interface ClosedDescendantBodyRow {
  page_id: number;
  body: string;
  depth: number;
}

const MESSAGE_ROLES = new Set<PageMessageRole>([
  'teacher',
  'user',
  'maintenance',
]);

const ACTION_TYPES = new Set<PageActionType>([
  'edited_note',
  'appended_note',
  'end',
  'reopened',
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
        !MESSAGE_ROLES.has(entry.role as PageMessageRole)
      ) {
        return [];
      }

      const hasText = 'text' in entry && typeof entry.text === 'string';
      const actionType =
        'actionType' in entry &&
        ACTION_TYPES.has(entry.actionType as PageActionType)
          ? (entry.actionType as PageActionType)
          : undefined;

      if (!hasText && !actionType) {
        return [];
      }

      return [
        {
          role: entry.role as PageMessageRole,
          text: hasText ? entry.text : '',
          ...(actionType ? { actionType } : {}),
          ...('content' in entry && typeof entry.content === 'string'
            ? { content: entry.content }
            : {}),
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
  private readonly updateBodyAndLogStatement;
  private readonly updateEditedBodyStatement;
  private readonly closeWithLogStatement;
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.insertStatement = this.db.prepare(`
      INSERT INTO pages (
        parent_page_id,
        body,
        source,
        parse_status,
        page_status
      )
      VALUES (?, ?, ?, 'pending', 'reading')
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
    this.updateBodyAndLogStatement = this.db.prepare(`
      UPDATE pages
      SET body = ?, companion_log = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    this.updateEditedBodyStatement = this.db.prepare(`
      UPDATE pages
      SET body = ?,
          edge_title = NULL,
          parse_status = 'pending',
          companion_log = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    this.closeWithLogStatement = this.db.prepare(`
      UPDATE pages
      SET page_status = 'closed',
          companion_log = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
  }

  create(
    body: string,
    source: string,
    openingMessage?: OpeningMessage,
    parentPageId: number | null = null,
  ): PageSnapshot {
    return this.withTransaction(() => {
      const result = this.insertStatement.run(
        parentPageId,
        body,
        source || null,
      );
      const pageId = Number(result.lastInsertRowid);

      if (openingMessage?.text) {
        const messages: PageMessageSnapshot[] = [
          {
            role: 'teacher',
            text: openingMessage.text,
            requestId: openingMessage.requestId,
            createdAt: Date.now(),
          },
        ];
        this.updateLogStatement.run(JSON.stringify(messages), pageId);
      }

      const page = this.findById(pageId);

      if (!page) {
        throw new Error('新页边写入后无法读取');
      }

      return page;
    });
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

  listClosedDescendantBodies(
    pageId: number,
    includeSelf = false,
  ): ClosedDescendantBody[] {
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return [];
    }

    const rows = this.db
      .prepare(
        `
          WITH RECURSIVE descendants(
            page_id,
            body,
            page_status,
            depth,
            path
          ) AS (
            SELECT
              id,
              body,
              page_status,
              0,
              printf(',%d,', id)
            FROM pages
            WHERE id = ?

            UNION ALL

            SELECT
              pages.id,
              pages.body,
              pages.page_status,
              descendants.depth + 1,
              descendants.path || pages.id || ','
            FROM pages
            JOIN descendants
              ON pages.parent_page_id = descendants.page_id
            WHERE
              descendants.depth < 100
              AND instr(
                descendants.path,
                ',' || pages.id || ','
              ) = 0
          )
          SELECT page_id, body, depth
          FROM descendants
          WHERE
            page_status = 'closed'
            AND (? = 1 OR depth > 0)
          ORDER BY depth ASC, page_id ASC
        `,
      )
      .all(pageId, includeSelf ? 1 : 0) as unknown as ClosedDescendantBodyRow[];

    return rows.map((row) => ({
      pageId: row.page_id,
      body: row.body,
      depth: row.depth,
    }));
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

  appendText(
    pageId: number,
    content: string,
    requestId: string,
  ):
    | { ok: true; page: PageSnapshot }
    | { ok: false; reason: 'not_found' | 'closed' } {
    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return { ok: false, reason: 'not_found' };
      }

      if (page.status === 'closed') {
        return { ok: false, reason: 'closed' };
      }

      if (page.messages.some((message) => message.requestId === requestId)) {
        return { ok: true, page };
      }

      const normalizedContent = content.trim();
      const messages: PageMessageSnapshot[] = [
        ...page.messages,
        {
          role: 'maintenance',
          text: '',
          actionType: 'appended_note',
          content: normalizedContent,
          requestId,
          createdAt: Date.now(),
        },
      ];
      const nextBody = `${page.body}\n\n${normalizedContent}`;

      this.updateBodyAndLogStatement.run(
        nextBody,
        JSON.stringify(messages),
        pageId,
      );

      const updatedPage = this.findById(pageId);
      if (!updatedPage) {
        throw new Error('补一句后无法读取页边');
      }

      return { ok: true, page: updatedPage };
    });
  }

  editText(
    pageId: number,
    body: string,
    requestId: string,
  ):
    | { ok: true; page: PageSnapshot }
    | { ok: false; reason: 'not_found' | 'closed' } {
    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return { ok: false, reason: 'not_found' };
      }

      if (page.status === 'closed') {
        return { ok: false, reason: 'closed' };
      }

      if (page.messages.some((message) => message.requestId === requestId)) {
        return { ok: true, page };
      }

      const normalizedBody = body.trim();
      const messages: PageMessageSnapshot[] = [
        ...page.messages,
        {
          role: 'maintenance',
          text: '',
          actionType: 'edited_note',
          requestId,
          createdAt: Date.now(),
        },
      ];

      this.updateEditedBodyStatement.run(
        normalizedBody,
        JSON.stringify(messages),
        pageId,
      );

      const updatedPage = this.findById(pageId);
      if (!updatedPage) {
        throw new Error('改批注后无法读取页边');
      }

      return { ok: true, page: updatedPage };
    });
  }

  closePage(
    pageId: number,
    requestId: string,
  ): { ok: true; page: PageSnapshot } | { ok: false; reason: 'not_found' } {
    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return { ok: false, reason: 'not_found' };
      }

      if (
        page.status === 'closed' ||
        page.messages.some((message) => message.requestId === requestId)
      ) {
        return { ok: true, page };
      }

      const messages: PageMessageSnapshot[] = [
        ...page.messages,
        {
          role: 'teacher',
          text: '',
          actionType: 'end',
          requestId,
          createdAt: Date.now(),
        },
      ];

      this.closeWithLogStatement.run(JSON.stringify(messages), pageId);

      const updatedPage = this.findById(pageId);
      if (!updatedPage) {
        throw new Error('合上页面后无法读取页边');
      }

      return { ok: true, page: updatedPage };
    });
  }

  appendTeacherPrompt(
    pageId: number,
    text: string,
    requestId: string,
  ):
    | { ok: true; page: PageSnapshot }
    | { ok: false; reason: 'not_found' | 'closed' } {
    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return { ok: false, reason: 'not_found' };
      }

      if (page.status !== 'reading') {
        return { ok: false, reason: 'closed' };
      }

      if (page.messages.some((message) => message.requestId === requestId)) {
        return { ok: true, page };
      }

      const messages: PageMessageSnapshot[] = [
        ...page.messages,
        {
          role: 'teacher',
          text,
          requestId,
          createdAt: Date.now(),
        },
      ];

      this.updateLogStatement.run(JSON.stringify(messages), pageId);

      const updatedPage = this.findById(pageId);
      if (!updatedPage) {
        throw new Error('写入跨页叩问后无法读取页边');
      }

      return { ok: true, page: updatedPage };
    });
  }

  clearAll(): number {
    return this.withTransaction(() => {
      const count = this.db
        .prepare('SELECT COUNT(*) AS count FROM pages')
        .get() as { count: number };
      this.db.prepare('DELETE FROM pages').run();
      return Number(count.count);
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
