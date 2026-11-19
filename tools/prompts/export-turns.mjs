#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import {
  ExportError,
  formatSummary,
  loadTurns,
  parseExportArgs,
  resolveDefaultDatabasePath,
} from './turn-export.mjs';

const HELP = `用法：
  node tools/prompts/export-turns.mjs [选项]

把本地 tap-along.db 中的请求回合导出为 JSONL，并标出规则失败的回复。
默认只读数据库，不修改任何数据。

选项：
  --db <path>       指定数据库文件；不传时按平台查找默认路径
  --out <path>      写入文件；不传时输出到 stdout
  --only-failures   只输出规则检查失败的行
  --no-messages     不输出完整 messages（减小体积）
  --since <date>    只导出该日期之后的回合（YYYY-MM-DD 或 ISO）
  --limit <n>       最多导出最近 n 条
  --help            显示本帮助

示例：
  node tools/prompts/export-turns.mjs --out turns.jsonl
  node tools/prompts/export-turns.mjs --only-failures --limit 50
  node tools/prompts/export-turns.mjs --db ./tap-along.db --since 2026-10-01
`;

const main = async () => {
  const options = parseExportArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const dbPath = options.dbPath ?? resolveDefaultDatabasePath();
  const { turns, warnings, summary } = await loadTurns({
    dbPath,
    since: options.since,
    limit: options.limit,
    onlyFailures: options.onlyFailures,
    includeMessages: options.includeMessages,
  });

  const text = turns.length
    ? `${turns.map((turn) => JSON.stringify(turn)).join('\n')}\n`
    : '';

  if (options.outPath) {
    await writeFile(options.outPath, text, 'utf8');
    console.error(`已写入 ${options.outPath}（${turns.length} 条）`);
  } else {
    process.stdout.write(text);
  }

  for (const warning of warnings) {
    console.error(`警告：${warning}`);
  }

  console.error(formatSummary(summary));
  console.error(`数据库：${dbPath}`);
};

main().catch((error) => {
  const message =
    error instanceof ExportError ? error.message : `导出失败：${error.message}`;
  console.error(message);
  process.exitCode = 1;
});
