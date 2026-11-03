import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { detectLatestLanguage } from '../../src/shared/conversation-language.ts';
import { isValidProviderBaseUrl } from '../../src/shared/providers.ts';
import { PROMPT_VERSION } from '../../src/main/prompts/index.ts';
import { buildChatCompletionsUrl } from '../../src/main/services/provider-connection.ts';
import { evaluateTeacherReply } from './evaluate-reply.mjs';
import {
  PromptCaseSelectionError,
  buildPromptMessages,
  loadPromptFixture,
  parsePromptCaseIds,
  selectPromptCases,
} from './load-cases.mjs';

const DEFAULT_TIMEOUT_MS = 60_000;

export class PromptEvalCliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptEvalCliError';
  }
}

class PromptEvalRequestError extends Error {
  constructor(rule, message) {
    super(message);
    this.name = 'PromptEvalRequestError';
    this.rule = rule;
  }
}

export const readPromptEvalConfig = (env = process.env) => {
  const baseUrl = env.PROMPT_EVAL_BASE_URL?.trim() ?? '';
  const model = env.PROMPT_EVAL_MODEL?.trim() ?? '';
  const apiKey = env.PROMPT_EVAL_API_KEY?.trim() ?? '';

  if (!baseUrl || !model || !apiKey) {
    throw new PromptEvalCliError(
      '请设置 PROMPT_EVAL_BASE_URL、PROMPT_EVAL_MODEL 和 PROMPT_EVAL_API_KEY。',
    );
  }

  if (!isValidProviderBaseUrl(baseUrl)) {
    throw new PromptEvalCliError(
      'PROMPT_EVAL_BASE_URL 必须是 HTTPS 地址，本地服务仅允许 http://localhost。',
    );
  }

  return { baseUrl, model, apiKey };
};

export const parsePromptEvalArgs = (argv = []) => {
  const result = { caseIds: [], reportPath: null, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      result.help = true;
      continue;
    }

    if (argument === '--case') {
      const value = argv[index + 1];

      if (!value || value.startsWith('--')) {
        throw new PromptEvalCliError('--case 缺少场景 ID。');
      }

      result.caseIds.push(...parsePromptCaseIds(value));
      index += 1;
      continue;
    }

    if (argument === '--report') {
      const value = argv[index + 1];

      if (!value || value.startsWith('--')) {
        throw new PromptEvalCliError('--report 缺少文件路径。');
      }

      result.reportPath = value;
      index += 1;
      continue;
    }

    throw new PromptEvalCliError(`未知参数：${argument}`);
  }

  result.caseIds = [...new Set(result.caseIds)];
  return result;
};

const requestErrorForStatus = (status) => {
  if (status === 401 || status === 403) {
    return new PromptEvalRequestError(
      'request_unauthorized',
      '模型鉴权失败，请检查 API Key。',
    );
  }

  if (status === 400 || status === 404) {
    return new PromptEvalRequestError(
      'request_model_unavailable',
      '模型不可用，请检查模型 ID 和 Base URL。',
    );
  }

  if (status === 408) {
    return new PromptEvalRequestError('request_timeout', '模型请求超时。');
  }

  if (status === 429) {
    return new PromptEvalRequestError(
      'request_rate_limited',
      '模型请求过于频繁。',
    );
  }

  return new PromptEvalRequestError(
    'request_failed',
    `模型请求失败，HTTP ${status}。`,
  );
};

const readCompletionContent = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PromptEvalRequestError(
      'request_invalid_response',
      '模型返回了无效响应。',
    );
  }

  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new PromptEvalRequestError(
      'request_empty_response',
      '模型返回了空内容。',
    );
  }

  return content.trim();
};

const requestModelReply = async ({
  config,
  messages,
  fetchImpl,
  timeoutMs,
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;

    try {
      response = await fetchImpl(buildChatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PromptEvalRequestError('request_timeout', '模型请求超时。');
      }

      throw new PromptEvalRequestError(
        'request_network_error',
        '无法连接到模型服务。',
      );
    }

    if (!response.ok) {
      throw requestErrorForStatus(response.status);
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw new PromptEvalRequestError(
        'request_invalid_response',
        '模型返回了无效 JSON。',
      );
    }

    return readCompletionContent(payload);
  } finally {
    clearTimeout(timeout);
  }
};

const summarizeReport = (results) => {
  const ruleFailureCounts = {};
  const responseErrors = [];

  for (const result of results) {
    for (const failure of result.failures) {
      ruleFailureCounts[failure.rule] =
        (ruleFailureCounts[failure.rule] ?? 0) + 1;
    }

    if (
      result.failures.some((failure) => failure.rule.startsWith('request_'))
    ) {
      responseErrors.push(result.id);
    }
  }

  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const languagePassed = results.filter(
    (result) => !result.failures.some((failure) => failure.rule === 'language'),
  ).length;
  const questionPassed = results.filter(
    (result) =>
      !result.failures.some((failure) => failure.rule === 'question_count'),
  ).length;

  return {
    total,
    passed,
    failed: total - passed,
    languageAccuracy: total === 0 ? 0 : languagePassed / total,
    questionAccuracy: total === 0 ? 0 : questionPassed / total,
    averageLatencyMs:
      total === 0
        ? 0
        : results.reduce((sum, result) => sum + result.latencyMs, 0) / total,
    averageCharacters:
      total === 0
        ? 0
        : results.reduce((sum, result) => sum + result.characters, 0) / total,
    ruleFailureCounts,
    responseErrors,
  };
};

export const runPromptEvaluation = async ({
  fixture,
  caseIds = [],
  config,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) => {
  const selectedCases = selectPromptCases(fixture, caseIds);
  const results = [];

  for (const testCase of selectedCases) {
    const messages = buildPromptMessages(fixture, testCase);
    const started = performance.now();
    let reply = '';
    let failures = [];
    let score = 0;

    try {
      reply = await requestModelReply({
        config,
        messages,
        fetchImpl,
        timeoutMs,
      });
      const evaluation = evaluateTeacherReply(reply, testCase.expected);
      failures = evaluation.failures;
      score = evaluation.score;
    } catch (error) {
      failures = [
        {
          rule:
            error instanceof PromptEvalRequestError
              ? error.rule
              : 'request_failed',
          message: error instanceof Error ? error.message : '模型请求失败。',
        },
      ];
    }

    results.push({
      id: testCase.id,
      mode: testCase.mode,
      passed: failures.length === 0,
      score,
      language: detectLatestLanguage(reply),
      latencyMs: Math.round(performance.now() - started),
      characters: reply.length,
      failures,
      reply,
    });
  }

  return {
    promptVersion: PROMPT_VERSION,
    provider: {
      baseUrl: config.baseUrl,
      model: config.model,
    },
    summary: summarizeReport(results),
    results,
  };
};

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

export const formatPromptEvalReport = (report) => {
  const lines = [
    '轻叩伴读 · Prompt 真实模型评测',
    '',
    `Prompt：${report.promptVersion}`,
    `模型：${report.provider.model}`,
    `服务：${report.provider.baseUrl}`,
    '',
  ];

  for (const result of report.results) {
    lines.push(
      `${result.passed ? '通过' : '失败'} · ${result.id} · ${result.mode} · ${result.language} · ${result.latencyMs}ms · ${result.characters} 字符`,
    );

    if (result.failures.length > 0) {
      lines.push(
        ...result.failures.map(
          (failure) => `  规则 ${failure.rule}：${failure.message}`,
        ),
      );
    }

    lines.push(`  回复：${result.reply || '（空）'}`, '');
  }

  lines.push(
    '汇总',
    `  总数：${report.summary.total}`,
    `  通过：${report.summary.passed}`,
    `  失败：${report.summary.failed}`,
    `  语言准确率：${formatPercent(report.summary.languageAccuracy)}`,
    `  单问句通过率：${formatPercent(report.summary.questionAccuracy)}`,
    `  平均耗时：${Math.round(report.summary.averageLatencyMs)}ms`,
    `  平均字符数：${Math.round(report.summary.averageCharacters)}`,
  );

  return lines.join('\n');
};

export const writePromptEvalReport = async (reportPath, report) => {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

export const runPromptEvalCli = async ({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  output = console,
} = {}) => {
  try {
    const options = parsePromptEvalArgs(argv);

    if (options.help) {
      output.log('用法：pnpm eval:prompts [--case id[,id]] [--report path]');
      return 0;
    }

    const config = readPromptEvalConfig(env);
    const fixture = await loadPromptFixture();
    const report = await runPromptEvaluation({
      fixture,
      caseIds: options.caseIds,
      config,
      fetchImpl,
    });

    output.log(formatPromptEvalReport(report));

    if (options.reportPath) {
      await writePromptEvalReport(options.reportPath, report);
    }

    return report.summary.failed === 0 ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof PromptEvalCliError ||
      error instanceof PromptCaseSelectionError
        ? error.message
        : 'Prompt 评测运行失败。';
    output.error(message);
    return 2;
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await runPromptEvalCli();
}
