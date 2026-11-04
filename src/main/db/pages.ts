import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { GuidanceUseResult, GuidanceView } from '../../shared/guidance.ts';
import { parseGuidanceView } from '../../shared/guidance.ts';
import type { TeacherSource } from '../../shared/search.ts';
import { isSafeExternalUrl } from '../../shared/shell.ts';
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
  guidance: string | null;
  page_status: PageLifecycleStatus;
  teaching_round_count: number;
}

export interface RetrievalPage {
  id: number;
  title: string;
  body: string;
  source: string;
  updatedAt: string;
}

interface RetrievalPageRow {
  id: number;
  edge_title: string | null;
  body: string;
  source: string | null;
  updated_at: string;
}

export interface GuidanceFinalizeOptions {
  removeOpening: boolean;
  expectedBody: string;
  allowUserMessages?: boolean;
  expectedMessageCount?: number;
}

interface OpeningMessage {
  text: string;
  requestId: string;
}

export interface ClosedDescendantBody {
  pageId: number;
  body: string;
  depth: number;
  /**
   * 该页面所在分叉分支的根页编号：
   * 查询页的直接子页（includeSelf 时为查询页自身）。
   * 目标页日志里的 forked 记录按这个编号定位插入位置。
   */
  rootPageId: number;
}

interface ClosedDescendantBodyRow {
  page_id: number;
  body: string;
  depth: number;
  root_id: number;
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
  'forked',
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

const parseSources = (value: unknown): TeacherSource[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<number>();
  const sources = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const { index, title, url, domain, publishedAt } = entry as Record<
      string,
      unknown
    >;

    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index <= 0 ||
      seen.has(index) ||
      typeof title !== 'string' ||
      !title.trim() ||
      !isSafeExternalUrl(url) ||
      typeof domain !== 'string' ||
      !domain.trim() ||
      (publishedAt !== undefined && typeof publishedAt !== 'string')
    ) {
      return [];
    }

    seen.add(index);

    return [
      {
        index,
        title: title.trim().slice(0, 300),
        url,
        domain: domain.trim().slice(0, 120),
        ...(typeof publishedAt === 'string'
          ? { publishedAt: publishedAt.slice(0, 40) }
          : {}),
      },
    ];
  });

  return sources.length > 0 ? sources.slice(0, 10) : undefined;
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

      const sources = parseSources(entry.sources);

      return [
        {
          role: entry.role as PageMessageRole,
          text: hasText ? entry.text : '',
          ...(actionType ? { actionType } : {}),
          ...('content' in entry && typeof entry.content === 'string'
            ? { content: entry.content }
            : {}),
          ...('childPageId' in entry &&
          typeof entry.childPageId === 'number' &&
          Number.isInteger(entry.childPageId) &&
          entry.childPageId > 0
            ? { childPageId: entry.childPageId }
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
          ...(entry.mode === 'answer' ? { mode: 'answer' as const } : {}),
          ...(sources ? { sources } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
};

const mapPageRow = (row: PageRow): PageSnapshot => {
  const guidance = parseGuidanceView(row.guidance);

  return {
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
    ...(guidance ? { guidance } : {}),
  };
};

const hashPageBody = (body: string) =>
  createHash('sha256').update(body).digest('hex');

export const escapeLikeTerm = (term: string) =>
  term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

export class PagesRepository {
  private readonly insertStatement;
  private readonly findStatement;
  private readonly listRecentReadingStatement;
  private readonly listClosedStatement;
  private readonly listAllStatement;
  private readonly updateLogStatement;
  private readonly updateLogAndRoundStatement;
  private readonly updateBodyAndLogStatement;
  private readonly updateEditedBodyStatement;
  private readonly updateGuidanceStatement;
  private readonly updateGuidanceAndLogStatement;
  private readonly listRetrievalStatement;
  private readonly insertFtsStatement;
  private readonly deleteFtsStatement;
  private readonly searchFtsStatement;
  private readonly searchLikeStatement;
  private readonly closeWithLogStatement;
  private readonly appendLogStatement;
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
        guidance,
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
        guidance,
        page_status,
        teaching_round_count
      FROM pages
      WHERE page_status = 'reading'
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `);

    this.listClosedStatement = this.db.prepare(`
      SELECT
        id,
        edge_title,
        body,
        source,
        parse_status,
        companion_log,
        guidance,
        page_status,
        teaching_round_count
      FROM pages
      WHERE page_status = 'closed'
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `);

    this.listAllStatement = this.db.prepare(`
      SELECT
        id,
        edge_title,
        body,
        source,
        parse_status,
        companion_log,
        guidance,
        page_status,
        teaching_round_count
      FROM pages
      ORDER BY updated_at DESC, id DESC
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
      SET body = ?,
          companion_log = ?,
          guidance = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    this.updateEditedBodyStatement = this.db.prepare(`
      UPDATE pages
      SET body = ?,
          edge_title = NULL,
          parse_status = 'pending',
          companion_log = ?,
          guidance = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    this.updateGuidanceStatement = this.db.prepare(`
      UPDATE pages
      SET guidance = ?
      WHERE id = ?
    `);
    this.updateGuidanceAndLogStatement = this.db.prepare(`
      UPDATE pages
      SET guidance = ?, companion_log = ?
      WHERE id = ?
    `);
    this.listRetrievalStatement = this.db.prepare(`
      SELECT
        id,
        edge_title,
        body,
        source,
        updated_at
      FROM pages
      WHERE id != ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `);
    this.insertFtsStatement = this.db.prepare(`
      INSERT INTO pages_fts(rowid, body, source)
      VALUES (?, ?, ?)
    `);
    this.deleteFtsStatement = this.db.prepare(`
      DELETE FROM pages_fts WHERE rowid = ?
    `);
    this.searchFtsStatement = this.db.prepare(`
      SELECT
        pages.id,
        pages.edge_title,
        pages.body,
        pages.source,
        pages.updated_at
      FROM pages_fts
      JOIN pages ON pages.id = pages_fts.rowid
      WHERE pages_fts MATCH ? AND pages.id != ?
      ORDER BY bm25(pages_fts)
      LIMIT ?
    `);
    this.searchLikeStatement = this.db.prepare(`
      SELECT
        id,
        edge_title,
        body,
        source,
        updated_at
      FROM pages
      WHERE id != ?
        AND body LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `);
    this.closeWithLogStatement = this.db.prepare(`
      UPDATE pages
      SET page_status = 'closed',
          companion_log = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    this.appendLogStatement = this.db.prepare(`
      UPDATE pages
      SET companion_log = ?
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
      this.insertFtsStatement.run(pageId, body, source || '');

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

      if (parentPageId !== null) {
        this.appendForkAnchor(parentPageId, pageId);
      }

      const page = this.findById(pageId);

      if (!page) {
        throw new Error('新页边写入后无法读取');
      }

      return page;
    });
  }

  /**
   * 在父页对谈日志末尾落一条 forked 记录。
   * 它同时是用户可见的「另起了一页」时间标记，也是子页正文回到父页上下文时的锚点。
   * 这里只写日志，不动 updated_at：另起一页不算父页自身有了新进展。
   */
  private appendForkAnchor(parentPageId: number, childPageId: number) {
    const parent = this.findById(parentPageId);

    if (!parent) {
      return;
    }

    const messages: PageMessageSnapshot[] = [
      ...parent.messages,
      {
        role: 'maintenance',
        text: '',
        actionType: 'forked',
        childPageId,
        requestId: `fork-${childPageId}`,
        createdAt: Date.now(),
      },
    ];

    this.appendLogStatement.run(JSON.stringify(messages), parentPageId);
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

  listClosed(limit: number): PageSnapshot[] {
    const rows = this.listClosedStatement.all(limit) as unknown as PageRow[];
    return rows.map(mapPageRow);
  }

  listAll(): PageSnapshot[] {
    const rows = this.listAllStatement.all() as unknown as PageRow[];
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
            root_id,
            path
          ) AS (
            SELECT
              id,
              body,
              page_status,
              0,
              id,
              printf(',%d,', id)
            FROM pages
            WHERE id = ?

            UNION ALL

            SELECT
              pages.id,
              pages.body,
              pages.page_status,
              descendants.depth + 1,
              CASE
                WHEN descendants.depth = 0 AND ? = 0 THEN pages.id
                ELSE descendants.root_id
              END,
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
          SELECT page_id, body, depth, root_id
          FROM descendants
          WHERE
            page_status = 'closed'
            AND (? = 1 OR depth > 0)
          ORDER BY depth ASC, page_id ASC
        `,
      )
      .all(
        pageId,
        includeSelf ? 1 : 0,
        includeSelf ? 1 : 0,
      ) as unknown as ClosedDescendantBodyRow[];

    return rows.map((row) => ({
      pageId: row.page_id,
      body: row.body,
      depth: row.depth,
      rootPageId: row.root_id,
    }));
  }

  listRecentPagesForRetrieval(
    excludePageId: number,
    limit = 100,
  ): RetrievalPage[] {
    if (
      !Number.isInteger(excludePageId) ||
      excludePageId <= 0 ||
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      return [];
    }

    const rows = this.listRetrievalStatement.all(
      excludePageId,
      limit,
    ) as unknown as RetrievalPageRow[];

    return rows.map((row) => this.toRetrievalPage(row));
  }

  searchPagesForRetrieval(
    excludePageId: number,
    terms: string[],
    limit = 100,
  ): RetrievalPage[] {
    if (
      !Number.isInteger(excludePageId) ||
      excludePageId <= 0 ||
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      return [];
    }

    if (!Array.isArray(terms)) {
      return this.listRecentPagesForRetrieval(excludePageId, limit);
    }

    const normalizedTerms = [
      ...new Set(
        terms.map((term) => term.trim()).filter((term) => term.length > 0),
      ),
    ];
    const ftsTerms = normalizedTerms
      .filter((term) => term.length >= 3)
      .slice(0, 20);
    const shortTerms = normalizedTerms
      .filter((term) => /^[\u3400-\u9fff]{2}$/.test(term))
      .slice(0, 3);
    const result: RetrievalPage[] = [];
    const seen = new Set<number>();
    const append = (pages: RetrievalPage[]) => {
      for (const page of pages) {
        if (result.length >= limit) {
          return;
        }

        if (!seen.has(page.id)) {
          seen.add(page.id);
          result.push(page);
        }
      }
    };

    if (ftsTerms.length > 0) {
      const match = ftsTerms
        .map((term) => `"${term.replaceAll('"', '""')}"`)
        .join(' OR ');

      try {
        append(
          (
            this.searchFtsStatement.all(
              match,
              excludePageId,
              limit,
            ) as unknown as RetrievalPageRow[]
          ).map((row) => this.toRetrievalPage(row)),
        );
      } catch {
        // FTS 查询失败时继续走短词和最近页兜底。
      }
    }

    for (const term of shortTerms) {
      try {
        append(
          (
            this.searchLikeStatement.all(
              excludePageId,
              `%${escapeLikeTerm(term)}%`,
              limit,
            ) as unknown as RetrievalPageRow[]
          ).map((row) => this.toRetrievalPage(row)),
        );
      } catch {
        // 单个短词查询失败不应阻断其余召回。
      }
    }

    if (result.length < limit) {
      append(this.listRecentPagesForRetrieval(excludePageId, limit));
    }

    return result;
  }

  private toRetrievalPage(row: RetrievalPageRow): RetrievalPage {
    return {
      id: row.id,
      title: row.edge_title?.trim() || deriveFallbackTitle(row.body),
      body: row.body,
      source: row.source ?? '',
      updatedAt: row.updated_at,
    };
  }

  private replaceFtsIndex(pageId: number, body: string, source: string) {
    this.deleteFtsStatement.run(pageId);
    this.insertFtsStatement.run(pageId, body, source || '');
  }

  finalizeGuidance(
    pageId: number,
    guidance: GuidanceView,
    {
      removeOpening,
      expectedBody,
      allowUserMessages = false,
      expectedMessageCount,
    }: GuidanceFinalizeOptions,
  ): PageSnapshot | null {
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return null;
    }

    const guidanceJson = JSON.stringify(guidance);

    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (
        !page ||
        page.status !== 'reading' ||
        page.body !== expectedBody ||
        (!allowUserMessages &&
          page.messages.some((message) => message.role === 'user')) ||
        (expectedMessageCount !== undefined &&
          page.messages.length !== expectedMessageCount)
      ) {
        return null;
      }

      if (removeOpening) {
        const messages = page.messages.filter(
          (message) => message.requestId !== 'opening',
        );
        this.updateGuidanceAndLogStatement.run(
          guidanceJson,
          JSON.stringify(messages),
          pageId,
        );
      } else {
        this.updateGuidanceStatement.run(guidanceJson, pageId);
      }

      return this.findById(pageId);
    });
  }

  useGuidanceSuggestion(
    pageId: number,
    suggestionId: string,
  ): GuidanceUseResult {
    if (!Number.isInteger(pageId) || pageId <= 0 || !suggestionId.trim()) {
      return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
    }

    return this.withTransaction(() => {
      const page = this.findById(pageId);

      if (!page) {
        return { ok: false, errorCode: 'PAGE_NOT_FOUND' };
      }

      if (page.status !== 'reading') {
        return { ok: false, errorCode: 'PAGE_CLOSED' };
      }

      const guidance = page.guidance;

      if (!guidance || guidance.bodyHash !== hashPageBody(page.body)) {
        return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
      }

      const suggestion = guidance.suggestions.find(
        (item) => item.id === suggestionId,
      );

      if (!suggestion) {
        return { ok: false, errorCode: 'TEACHER_INVALID_REQUEST' };
      }

      if (suggestion.used) {
        return {
          ok: true,
          question: suggestion.question,
          guidance,
        };
      }

      const requestId = `guidance-${suggestion.id}`;
      const hasMessage = page.messages.some(
        (message) =>
          message.role === 'teacher' && message.requestId === requestId,
      );
      const messages = hasMessage
        ? page.messages
        : [
            ...page.messages,
            {
              role: 'teacher' as const,
              text: suggestion.question,
              requestId,
              createdAt: Date.now(),
            },
          ];
      const nextGuidance: GuidanceView = {
        ...guidance,
        suggestions: guidance.suggestions.map((item) =>
          item.id === suggestion.id ? { ...item, used: true } : item,
        ),
        updatedAt: Date.now(),
      };

      this.updateGuidanceAndLogStatement.run(
        JSON.stringify(nextGuidance),
        JSON.stringify(messages),
        pageId,
      );

      return {
        ok: true,
        question: suggestion.question,
        guidance: nextGuidance,
      };
    });
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

  completeResearchAnswer(
    pageId: number,
    reply: string,
    sources: TeacherSource[],
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
          requestId,
          mode: 'answer',
          sources,
          createdAt: Date.now(),
        },
      ];

      this.updateLogStatement.run(JSON.stringify(messages), pageId);
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
      const baseMessages = page.guidance
        ? page.messages.filter((message) => message.requestId !== 'opening')
        : page.messages;
      const messages: PageMessageSnapshot[] = [
        ...baseMessages,
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
      this.replaceFtsIndex(pageId, nextBody, page.source);

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
      const baseMessages = page.guidance
        ? page.messages.filter((message) => message.requestId !== 'opening')
        : page.messages;
      const messages: PageMessageSnapshot[] = [
        ...baseMessages,
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
      this.replaceFtsIndex(pageId, normalizedBody, page.source);

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
      this.db.prepare('DELETE FROM pages_fts').run();
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
