import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PromptEvalCliError,
  formatPromptEvalReport,
  parsePromptEvalArgs,
  readPromptEvalConfig,
  runPromptEvalCli,
  runPromptEvaluation,
  writePromptEvalReport,
} from '../tools/prompts/eval-live.mjs';
import {
  PromptCaseSelectionError,
  loadPromptFixture,
  parsePromptCaseIds,
  selectPromptCases,
} from '../tools/prompts/load-cases.mjs';

const fixture = await loadPromptFixture();
const config = {
  baseUrl: 'http://localhost:11434/v1',
  model: 'reading-model',
  apiKey: 'sk-eval-private-key',
};

const completionResponse = (content) => ({
  ok: true,
  status: 200,
  async json() {
    return {
      choices: [
        {
          message: { content },
        },
      ],
    };
  },
});

const createOutput = () => {
  const logs = [];
  const errors = [];

  return {
    logs,
    errors,
    log(value) {
      logs.push(String(value));
    },
    error(value) {
      errors.push(String(value));
    },
  };
};

test('Prompt 用例加载器应支持筛选、去重和未知编号报错', () => {
  assert.equal(selectPromptCases(fixture).length, 14);
  assert.deepEqual(
    selectPromptCases(fixture, ['en-ask', 'zh-ask']).map(
      (testCase) => testCase.id,
    ),
    ['en-ask', 'zh-ask'],
  );
  assert.deepEqual(parsePromptCaseIds(' zh-ask,resume-context,zh-ask '), [
    'zh-ask',
    'resume-context',
  ]);
  assert.throws(
    () => selectPromptCases(fixture, ['missing-case']),
    PromptCaseSelectionError,
  );
});

test('Prompt 评测参数应支持场景筛选、报告路径和帮助', () => {
  assert.deepEqual(
    parsePromptEvalArgs([
      '--case',
      'zh-ask,en-ask',
      '--case',
      'resume-context',
      '--report',
      'report.json',
    ]),
    {
      caseIds: ['zh-ask', 'en-ask', 'resume-context'],
      reportPath: 'report.json',
      help: false,
    },
  );
  assert.equal(parsePromptEvalArgs(['--help']).help, true);

  for (const argv of [
    ['--case'],
    ['--case', '--report', 'x'],
    ['--report'],
    ['--unknown'],
  ]) {
    assert.throws(() => parsePromptEvalArgs(argv), PromptEvalCliError);
  }
});

test('Prompt 评测环境配置应校验必填项和 URL', () => {
  assert.deepEqual(
    readPromptEvalConfig({
      PROMPT_EVAL_BASE_URL: 'http://localhost:11434/v1',
      PROMPT_EVAL_MODEL: 'reading-model',
      PROMPT_EVAL_API_KEY: ' sk-private ',
    }),
    {
      baseUrl: 'http://localhost:11434/v1',
      model: 'reading-model',
      apiKey: 'sk-private',
    },
  );

  for (const env of [
    {},
    {
      PROMPT_EVAL_BASE_URL: 'https://example.com/v1',
      PROMPT_EVAL_MODEL: 'model',
    },
    {
      PROMPT_EVAL_BASE_URL: 'http://example.com/v1',
      PROMPT_EVAL_MODEL: 'model',
      PROMPT_EVAL_API_KEY: 'key',
    },
  ]) {
    assert.throws(() => readPromptEvalConfig(env), PromptEvalCliError);
  }
});

test('真实模型评测运行器应汇总通过、规则失败且不泄露 Key', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const body = JSON.parse(options.body);
    const serialized = JSON.stringify(body.messages);
    const content = serialized.includes('Attention as a resource')
      ? '你在问注意力为什么会被任务带走，像是在怀疑任务的力量。你是从哪件事上感到这一点的？'
      : '你在问任务如何影响注意力，重点像是它的作用机制。最近哪个任务的影响最明显？';

    return completionResponse(content);
  };
  const report = await runPromptEvaluation({
    fixture,
    caseIds: ['zh-ask', 'en-ask'],
    config,
    fetchImpl,
  });

  assert.equal(requests.length, 2);

  for (const request of requests) {
    assert.equal(request.url, 'http://localhost:11434/v1/chat/completions');
    assert.equal(
      request.options.headers.Authorization,
      `Bearer ${config.apiKey}`,
    );
    assert.equal(request.options.body.includes(config.apiKey), false);
    const body = JSON.parse(request.options.body);
    assert.equal(body.model, config.model);
    assert.equal(body.stream, false);
    assert.ok(body.messages.length > 0);
  }

  assert.deepEqual(
    report.results.map((result) => [result.id, result.passed]),
    [
      ['zh-ask', true],
      ['en-ask', false],
    ],
  );
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 1);
  assert.equal(report.summary.languageAccuracy, 0.5);
  assert.equal(report.summary.questionAccuracy, 1);
  assert.equal(JSON.stringify(report).includes(config.apiKey), false);

  const text = formatPromptEvalReport(report);
  assert.match(text, /Prompt 真实模型评测/);
  assert.match(text, /通过 · zh-ask/);
  assert.match(text, /失败 · en-ask/);
  assert.equal(text.includes(config.apiKey), false);
});

test('真实模型评测应安全处理请求和响应异常', async (t) => {
  const cases = [
    {
      name: '鉴权失败',
      fetchImpl: async () => ({ ok: false, status: 401 }),
      rule: 'request_unauthorized',
    },
    {
      name: '无效 JSON',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new Error('invalid json');
        },
      }),
      rule: 'request_invalid_response',
    },
    {
      name: '空回复',
      fetchImpl: async () => completionResponse('   '),
      rule: 'request_empty_response',
    },
    {
      name: '网络失败',
      fetchImpl: async () => {
        throw new TypeError('network failed');
      },
      rule: 'request_network_error',
    },
    {
      name: '超时',
      timeoutMs: 5,
      fetchImpl: async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
      rule: 'request_timeout',
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const report = await runPromptEvaluation({
        fixture,
        caseIds: ['zh-ask'],
        config,
        fetchImpl: scenario.fetchImpl,
        timeoutMs: scenario.timeoutMs,
      });
      const result = report.results[0];

      assert.equal(result.passed, false);
      assert.equal(result.failures[0].rule, scenario.rule);
      assert.equal(JSON.stringify(report).includes(config.apiKey), false);
    });
  }
});

test('真实模型评测 CLI 应在缺少配置时不发起请求', async () => {
  const output = createOutput();
  let fetchCalls = 0;
  const exitCode = await runPromptEvalCli({
    argv: [],
    env: {},
    fetchImpl: async () => {
      fetchCalls += 1;
      return completionResponse('不应请求');
    },
    output,
  });

  assert.equal(exitCode, 2);
  assert.equal(fetchCalls, 0);
  assert.match(output.errors[0], /PROMPT_EVAL_BASE_URL/);
});

test('真实模型评测 CLI 应支持单场景报告和帮助', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-eval-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, 'prompt-report.json');
  const output = createOutput();
  const exitCode = await runPromptEvalCli({
    argv: ['--case', 'zh-ask', '--report', reportPath],
    env: {
      PROMPT_EVAL_BASE_URL: 'http://localhost:11434/v1',
      PROMPT_EVAL_MODEL: 'reading-model',
      PROMPT_EVAL_API_KEY: 'sk-cli-private-key',
    },
    fetchImpl: async () =>
      completionResponse(
        '你在问任务如何影响注意力，重点像是它的作用机制。最近哪个任务的影响最明显？',
      ),
    output,
  });

  assert.equal(exitCode, 0);
  assert.match(output.logs.join('\n'), /通过 · zh-ask/);
  assert.equal(output.logs.join('\n').includes('sk-cli-private-key'), false);

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.summary.total, 1);
  assert.equal(report.results[0].id, 'zh-ask');
  assert.equal(JSON.stringify(report).includes('sk-cli-private-key'), false);

  const helpOutput = createOutput();
  assert.equal(
    await runPromptEvalCli({
      argv: ['--help'],
      env: {},
      fetchImpl: async () => completionResponse('不应请求'),
      output: helpOutput,
    }),
    0,
  );
  assert.match(helpOutput.logs[0], /pnpm eval:prompts/);
});

test('Prompt 评测报告应写入中文规则结果', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'tap-along-report-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const reportPath = path.join(directory, 'report.json');
  const report = await runPromptEvaluation({
    fixture,
    caseIds: ['en-ask'],
    config,
    fetchImpl: async () => completionResponse('注意力为什么有限？'),
  });

  await writePromptEvalReport(reportPath, report);
  const stored = JSON.parse(await readFile(reportPath, 'utf8'));

  assert.equal(
    stored.results[0].failures.some((f) => f.rule === 'language'),
    true,
  );
  assert.equal(JSON.stringify(stored).includes(config.apiKey), false);
});
