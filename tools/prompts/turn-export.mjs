import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { detectLatestLanguage } from '../../src/shared/conversation-language.ts';
import { evaluateTeacherReply } from './evaluate-reply.mjs';

export const MAX_IDLE_MS = 24 * 60 * 60 * 1000;

const MESSAGE_ROLES = new Set(['teacher', 'user', 'maintenance']);

export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportError';
  }
}

const isRecord = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * 解析 companion_log。非法 JSON 或非数组时返回 ok=false，由调用方计入警告。
 */
export const parseCompanionLog = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { messages: [], ok: true };
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return { messages: [], ok: false };
    }

    const messages = parsed.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.text !== 'string') {
        return [];
      }

      if (typeof entry.role !== 'string' || !MESSAGE_ROLES.has(entry.role)) {
        return [];
      }

      return [
        {
          role: entry.role,
          text: entry.text,
          ...(typeof entry.requestId === 'string'
            ? { requestId: entry.requestId }
            : {}),
          ...(typeof entry.actionType === 'string'
            ? { actionType: entry.actionType }
            : {}),
          ...(typeof entry.createdAt === 'number'
            ? { createdAt: entry.createdAt }
            : {}),
        },
      ];
    });

    return { messages, ok: true };
  } catch {
    return { messages: [], ok: false };
  }
};

const toLanguage = (value) => (value === 'zh' || value === 'en' ? value : null);

const deriveOutcome = ({
  hasUserEvent,
  actionType,
  pageStatus,
  anchorCreatedAt,
  now = Date.now(),
  maxIdleMs = MAX_IDLE_MS,
}) => {
  if (hasUserEvent) {
    return 'continued';
  }

  if (actionType === 'forked') {
    return 'forked';
  }

  if (actionType === 'edited_note') {
    return 'edited';
  }

  if (actionType === 'appended_note') {
    return 'continued';
  }

  if (actionType === 'end' || pageStatus === 'closed') {
    return 'closed';
  }

  if (
    typeof anchorCreatedAt === 'number' &&
    now - anchorCreatedAt > maxIdleMs
  ) {
    return 'abandoned';
  }

  return 'unknown';
};

/**
 * 从页面日志里为每个老师 requestId 建立上下文。
 * 同一 requestId 出现多次时保留第一条并记录警告。
 */
export const buildPageIndex = (pages) => {
  const byRequestId = new Map();
  const warnings = [];

  for (const page of pages) {
    const { messages, ok } = parseCompanionLog(page.companion_log);

    if (!ok) {
      warnings.push(`页面 ${page.id} 的对谈日志无法解析，已跳过`);
      continue;
    }

    messages.forEach((message, index) => {
      if (message.role !== 'teacher' || !message.requestId) {
        return;
      }

      if (byRequestId.has(message.requestId)) {
        warnings.push(`重复的 requestId：${message.requestId}`);
        return;
      }

      const after = messages.slice(index + 1);
      const nextUserText = after.find((entry) => entry.role === 'user')?.text;
      const firstEvent = after.find(
        (entry) =>
          entry.role === 'user' ||
          (entry.role === 'maintenance' && entry.actionType),
      );
      const previousUserText = messages
        .slice(0, index)
        .reverse()
        .find((entry) => entry.role === 'user')?.text;

      byRequestId.set(message.requestId, {
        pageId: page.id,
        pageStatus: page.page_status,
        nextUserText: nextUserText ?? null,
        hasUserEvent: firstEvent?.role === 'user',
        actionType:
          firstEvent?.role === 'maintenance'
            ? (firstEvent.actionType ?? null)
            : null,
        previousUserText: previousUserText ?? null,
        teacherMessageCreatedAt: message.createdAt ?? null,
      });
    });
  }

  return { byRequestId, warnings };
};

const parseOutboundMessages = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.content !== 'string' ||
        (entry.role !== 'system' &&
          entry.role !== 'user' &&
          entry.role !== 'assistant')
      ) {
        return [];
      }

      return [{ role: entry.role, content: entry.content }];
    });
  } catch {
    return [];
  }
};

export const buildTurn = (
  row,
  context,
  { includeMessages = true, now = Date.now() } = {},
) => {
  const messages = parseOutboundMessages(row.messages);
  const reply = typeof row.reply === 'string' ? row.reply : null;
  const language = context?.previousUserText
    ? toLanguage(detectLatestLanguage(context.previousUserText))
    : null;
  const ruleFailures = reply
    ? evaluateTeacherReply(reply, language ? { language } : {}).failures
    : [];

  return {
    requestId: row.request_id,
    pageId: context?.pageId ?? null,
    status: row.status,
    providerId: row.provider_id ?? null,
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? null,
    promptHash: row.prompt_hash ?? null,
    latencyMs: row.latency_ms ?? null,
    temperature: row.temperature ?? null,
    createdAt: row.created_at,
    ...(includeMessages ? { messages } : {}),
    reply,
    nextUserText: context?.nextUserText ?? null,
    language,
    outcome: context
      ? deriveOutcome({
          hasUserEvent: context.hasUserEvent,
          actionType: context.actionType,
          pageStatus: context.pageStatus,
          anchorCreatedAt:
            context.teacherMessageCreatedAt ?? row.created_at ?? undefined,
          now,
        })
      : 'unknown',
    inferred: true,
    incomplete: !reply || row.status !== 'sent' || messages.length === 0,
    ruleFailures,
  };
};

export const summarizeTurns = (turns) => {
  const byStatus = {};
  const byOutcome = {};
  const byLanguage = {};
  const ruleFailureCounts = {};
  let incomplete = 0;

  for (const turn of turns) {
    byStatus[turn.status] = (byStatus[turn.status] ?? 0) + 1;
    byOutcome[turn.outcome] = (byOutcome[turn.outcome] ?? 0) + 1;

    const language = turn.language ?? 'unknown';
    byLanguage[language] = (byLanguage[language] ?? 0) + 1;

    if (turn.incomplete) {
      incomplete += 1;
    }

    for (const failure of turn.ruleFailures) {
      ruleFailureCounts[failure.rule] =
        (ruleFailureCounts[failure.rule] ?? 0) + 1;
    }
  }

  return {
    total: turns.length,
    incomplete,
    turnsWithFailures: turns.filter((turn) => turn.ruleFailures.length > 0)
      .length,
    byStatus,
    byOutcome,
    byLanguage,
    ruleFailureCounts,
  };
};

const REQUEST_INSPECTION_COLUMNS = [
  'request_id',
  'status',
  'provider_id',
  'model',
  'messages',
  'error_code',
  'reply',
  'latency_ms',
  'prompt_version',
  'prompt_hash',
  'temperature',
  'created_at',
];

/**
 * 兼容升级前的旧库：缺少的采集列按 NULL 读取，旧记录会标记为不完整。
 */
const buildRequestInspectionQuery = (db) => {
  const available = new Set(
    db
      .prepare("PRAGMA table_info('request_inspections')")
      .all()
      .map((row) => String(row.name)),
  );
  const select = REQUEST_INSPECTION_COLUMNS.map((column) =>
    available.has(column) ? column : `NULL AS ${column}`,
  ).join(',\n    ');

  return `
  SELECT
    ${select}
  FROM request_inspections
  ORDER BY created_at ASC
`;
};

const PAGES_QUERY = `
  SELECT id, page_status, companion_log
  FROM pages
`;

export const loadTurns = async ({
  dbPath,
  since = null,
  limit = null,
  onlyFailures = false,
  includeMessages = true,
  now = Date.now(),
} = {}) => {
  if (!dbPath) {
    throw new ExportError('缺少数据库路径。');
  }

  if (!existsSync(dbPath)) {
    throw new ExportError(`找不到数据库文件：${dbPath}`);
  }

  let db;

  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    throw new ExportError(`无法以只读方式打开数据库：${dbPath}`);
  }

  try {
    const rows = db.prepare(buildRequestInspectionQuery(db)).all();
    const pages = db.prepare(PAGES_QUERY).all();
    const { byRequestId, warnings } = buildPageIndex(pages);
    let turns = rows.map((row) =>
      buildTurn(row, byRequestId.get(row.request_id), {
        includeMessages,
        now,
      }),
    );

    for (const row of rows) {
      if (!byRequestId.has(row.request_id)) {
        warnings.push(`未匹配到对谈记录：${row.request_id}`);
      }
    }

    if (since !== null) {
      turns = turns.filter((turn) => turn.createdAt >= since);
    }

    if (limit !== null) {
      turns = turns.slice(-limit);
    }

    if (onlyFailures) {
      turns = turns.filter((turn) => turn.ruleFailures.length > 0);
    }

    return { turns, warnings, summary: summarizeTurns(turns) };
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }

    throw new ExportError(`读取数据库失败：${error.message}`);
  } finally {
    db.close();
  }
};

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new ExportError(`${flag} 缺少参数值。`);
  }

  return value;
};

export const parseSince = (value) => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = new Date(dateOnly ? `${value}T00:00:00` : value).getTime();

  if (!Number.isFinite(timestamp)) {
    throw new ExportError(`无法解析 --since 日期：${value}`);
  }

  return timestamp;
};

export const parseExportArgs = (argv = []) => {
  const options = {
    dbPath: null,
    outPath: null,
    onlyFailures: false,
    includeMessages: true,
    since: null,
    limit: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      options.help = true;
      continue;
    }

    if (argument === '--db') {
      options.dbPath = requireValue(argv, index, '--db');
      index += 1;
      continue;
    }

    if (argument === '--out') {
      options.outPath = requireValue(argv, index, '--out');
      index += 1;
      continue;
    }

    if (argument === '--only-failures') {
      options.onlyFailures = true;
      continue;
    }

    if (argument === '--no-messages') {
      options.includeMessages = false;
      continue;
    }

    if (argument === '--since') {
      options.since = parseSince(requireValue(argv, index, '--since'));
      index += 1;
      continue;
    }

    if (argument === '--limit') {
      const value = Number(requireValue(argv, index, '--limit'));

      if (!Number.isInteger(value) || value <= 0) {
        throw new ExportError('--limit 必须是正整数。');
      }

      options.limit = value;
      index += 1;
      continue;
    }

    throw new ExportError(`未知参数：${argument}`);
  }

  return options;
};

const databaseCandidates = ({
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
} = {}) => {
  if (platform === 'darwin') {
    return [
      path.join(home, 'Library/Application Support/TapAlong/tap-along.db'),
      path.join(home, 'Library/Application Support/tap-along/tap-along.db'),
    ];
  }

  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.join(home, 'AppData', 'Roaming');

    return [
      path.join(appData, 'TapAlong', 'tap-along.db'),
      path.join(appData, 'tap-along', 'tap-along.db'),
    ];
  }

  const configHome = env.XDG_CONFIG_HOME ?? path.join(home, '.config');

  return [
    path.join(configHome, 'TapAlong', 'tap-along.db'),
    path.join(configHome, 'tap-along', 'tap-along.db'),
  ];
};

export const resolveDefaultDatabasePath = (options = {}) => {
  const candidates = databaseCandidates(options);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new ExportError(
    `找不到本地数据库，请用 --db 指定。尝试过：\n${candidates.join('\n')}`,
  );
};

export const formatSummary = (summary) => {
  const lines = [
    `回合总数：${summary.total}`,
    `不完整：${summary.incomplete}`,
    `含规则失败：${summary.turnsWithFailures}`,
    `状态：${formatCounts(summary.byStatus)}`,
    `outcome：${formatCounts(summary.byOutcome)}`,
    `语言：${formatCounts(summary.byLanguage)}`,
  ];

  const ruleEntries = Object.entries(summary.ruleFailureCounts).sort(
    (left, right) => right[1] - left[1],
  );

  lines.push(
    `规则失败：${ruleEntries.length === 0 ? '无' : ruleEntries.map(([rule, count]) => `${rule} ${count}`).join(' / ')}`,
  );

  return lines.join('\n');
};

const formatCounts = (counts) => {
  const entries = Object.entries(counts);

  if (entries.length === 0) {
    return '无';
  }

  return entries.map(([key, count]) => `${key} ${count}`).join(' / ');
};
