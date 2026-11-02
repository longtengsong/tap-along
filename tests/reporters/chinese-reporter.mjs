import path from 'node:path';

const formatPercent = (value) => `${value.toFixed(1)}%`;

const formatDuration = (value) => `${(value ?? 0).toFixed(1)} 毫秒`;

const isRunnableTest = (data) => data.line > 1 && !data.name.endsWith('.mjs');

const formatErrorMessage = (error) =>
  error?.message ?? error?.stack ?? '未知错误';

export default async function* chineseReporter(source) {
  let testSummary;
  let coverageSummary;

  yield '轻叩伴读 · 单元测试\n\n';

  for await (const event of source) {
    const data = event.data;

    if (event.type === 'test:pass' && isRunnableTest(data)) {
      yield `  ✓ ${data.name}（${formatDuration(data.details.duration_ms)}）\n`;
    }

    if (event.type === 'test:fail' && isRunnableTest(data)) {
      yield `  ✗ ${data.name}（${formatDuration(data.details.duration_ms)}）\n`;
      yield `    ${formatErrorMessage(data.details.error)}\n`;
    }

    if (event.type === 'test:summary') {
      testSummary = data;
    }

    if (event.type === 'test:coverage') {
      coverageSummary = data.summary;
    }
  }

  yield '\n测试汇总\n';

  if (testSummary) {
    const { counts } = testSummary;
    yield `  用例总数：${counts.tests}\n`;
    yield `  通过：${counts.passed}\n`;
    yield `  失败：${counts.failed}\n`;
    yield `  跳过：${counts.skipped}\n`;
    yield `  总耗时：${formatDuration(testSummary.duration_ms)}\n`;
  } else {
    yield '  未取得测试汇总\n';
  }

  if (!coverageSummary) {
    yield '\n覆盖率报告\n  未生成覆盖率数据\n';
    return;
  }

  yield '\n覆盖率报告\n';
  yield '  文件                                  行覆盖率  分支覆盖率  函数覆盖率\n';
  yield `  ${'-'.repeat(76)}\n`;

  for (const file of coverageSummary.files) {
    const relativePath = path.relative(
      coverageSummary.workingDirectory,
      file.path,
    );
    yield `  ${relativePath.padEnd(38)} ${formatPercent(file.coveredLinePercent).padStart(8)}  ${formatPercent(file.coveredBranchPercent).padStart(10)}  ${formatPercent(file.coveredFunctionPercent).padStart(10)}\n`;
  }

  const totals = coverageSummary.totals;
  yield `  ${'合计'.padEnd(38)} ${formatPercent(totals.coveredLinePercent).padStart(8)}  ${formatPercent(totals.coveredBranchPercent).padStart(10)}  ${formatPercent(totals.coveredFunctionPercent).padStart(10)}\n`;
  yield `\n  覆盖率门槛：行 ${coverageSummary.thresholds.line}%，分支 ${coverageSummary.thresholds.branch}%，函数 ${coverageSummary.thresholds.function}%\n`;
}
