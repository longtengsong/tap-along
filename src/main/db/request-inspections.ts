import type { DatabaseSync } from 'node:sqlite';
import type { AppErrorCode } from '../../shared/errors.ts';
import type {
  TeacherRequestInspection,
  TeacherRequestInspectionMessage,
  TeacherRequestInspectionStatus,
} from '../../shared/pages.ts';

interface RequestInspectionRow {
  request_id: string;
  status: string;
  provider_id: string | null;
  model: string | null;
  messages: string;
  error_code: string | null;
  created_at: number;
}

export interface RequestInspectionStore {
  save(request: TeacherRequestInspection): void;
  get(requestId: string): TeacherRequestInspection | undefined;
  prune(maxEntries: number): void;
}

const isStatus = (value: string): value is TeacherRequestInspectionStatus =>
  value === 'sent' || value === 'failed' || value === 'fallback';

const parseMessages = (raw: string): TeacherRequestInspectionMessage[] => {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const message = entry as {
        role?: unknown;
        content?: unknown;
      };

      if (
        (message.role !== 'system' &&
          message.role !== 'user' &&
          message.role !== 'assistant') ||
        typeof message.content !== 'string'
      ) {
        return [];
      }

      return [{ role: message.role, content: message.content }];
    });
  } catch {
    return [];
  }
};

const toInspection = (
  row: RequestInspectionRow,
): TeacherRequestInspection | undefined => {
  if (!isStatus(row.status)) {
    return undefined;
  }

  return {
    requestId: row.request_id,
    status: row.status,
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.model ? { model: row.model } : {}),
    messages: parseMessages(row.messages),
    ...(row.error_code ? { errorCode: row.error_code as AppErrorCode } : {}),
    createdAt: row.created_at,
  };
};

/** 开发者请求记录的持久化存储，和页面数据共用同一个 SQLite 库。 */
export class RequestInspectionRepository implements RequestInspectionStore {
  private readonly upsertStatement;
  private readonly findStatement;
  private readonly pruneStatement;

  constructor(db: DatabaseSync) {
    this.upsertStatement = db.prepare(`
      INSERT INTO request_inspections (
        request_id,
        status,
        provider_id,
        model,
        messages,
        error_code,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        status = excluded.status,
        provider_id = excluded.provider_id,
        model = excluded.model,
        messages = excluded.messages,
        error_code = excluded.error_code,
        created_at = excluded.created_at
    `);
    this.findStatement = db.prepare(`
      SELECT
        request_id,
        status,
        provider_id,
        model,
        messages,
        error_code,
        created_at
      FROM request_inspections
      WHERE request_id = ?
    `);
    this.pruneStatement = db.prepare(`
      DELETE FROM request_inspections
      WHERE request_id NOT IN (
        SELECT request_id
        FROM request_inspections
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
      )
    `);
  }

  save(request: TeacherRequestInspection): void {
    this.upsertStatement.run(
      request.requestId,
      request.status,
      request.providerId ?? null,
      request.model ?? null,
      JSON.stringify(request.messages),
      request.errorCode ?? null,
      request.createdAt,
    );
  }

  get(requestId: string): TeacherRequestInspection | undefined {
    const row = this.findStatement.get(requestId) as
      | RequestInspectionRow
      | undefined;

    return row ? toInspection(row) : undefined;
  }

  prune(maxEntries: number): void {
    this.pruneStatement.run(Math.max(1, Math.floor(maxEntries)));
  }
}
