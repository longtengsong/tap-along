export interface IntentDecision {
  mode: 'reflect' | 'research';
  queries: string[];
  reason?: string;
}

export class IntentRouterError extends Error {
  constructor(message = '意图路由输出不符合契约') {
    super(message);
    this.name = 'IntentRouterError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractJson = (content: string): unknown => {
  const withoutFence = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new IntentRouterError();
  }

  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new IntentRouterError();
  }
};

const normalizeQueries = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .flatMap((entry) =>
          typeof entry === 'string' && entry.trim()
            ? [entry.trim().slice(0, 120)]
            : [],
        )
        .filter(Boolean),
    ),
  ].slice(0, 3);
};

/**
 * 把 intent router 的原始文本解析成 mode/queries。
 * 无查询时回退到用户问题属于路由策略，不在这里做。
 */
export const parseIntentOutput = (content: string): IntentDecision => {
  const parsed = extractJson(content);

  if (!isRecord(parsed)) {
    throw new IntentRouterError();
  }

  const mode = parsed.mode;

  if (mode !== 'research' && mode !== 'reflect') {
    throw new IntentRouterError();
  }

  if (mode === 'reflect') {
    return { mode, queries: [] };
  }

  return {
    mode,
    queries: normalizeQueries(parsed.queries),
    ...(typeof parsed.reason === 'string' && parsed.reason.trim()
      ? { reason: parsed.reason.trim().slice(0, 300) }
      : {}),
  };
};
