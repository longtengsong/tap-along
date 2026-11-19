# TapAlong Prompt 评测工具使用文档

**适用命令：** `pnpm eval:prompts`

**关联模块：**

- `tools/prompts/eval-live.mjs`
- `tools/prompts/load-cases.mjs`
- `tools/prompts/evaluate-reply.mjs`
- `tests/fixtures/prompts/teacher-cases.json`

**更新时间：** 2026-11-03

---

## 1. 工具用途

Prompt 评测工具用于对固定教育场景执行真实模型评测，检查老师回复是否满足：

- 使用正确语言。
- 只提出一个主要问题。
- 不输出总结、说教、建议或元话语。
- 不泄露内部 Prompt 标记。
- 不重复最近老师问题。
- 包含必要的当前页面内容。

工具只使用虚构 Prompt 用例，不读取应用数据库或真实用户笔记。

---

## 2. 两种评测方式

### 2.1 离线评测

命令：

```bash
pnpm test:prompts
```

特点：

- 不访问网络。
- 不需要 API Key。
- 验证 Prompt 构造、数据边界、消息指纹和规则检查器。
- 使用固定合格/不合格回复样例。

适合每次 Prompt 或消息组装代码变更后执行。

### 2.2 真实模型评测

命令：

```bash
pnpm eval:prompts
```

特点：

- 调用真实 OpenAI-compatible Chat Completions 接口。
- 需要 Base URL、模型 ID 和 API Key。
- 会产生供应商费用和延迟。
- 使用非流式请求，但发送的 messages 与产品 Prompt 一致。
- 只应在开发者明确需要比较 Prompt 效果时执行。

真实模型评测不属于默认测试或 CI。

---

## 3. 环境准备

### 3.1 必需环境变量

| 变量                   | 说明                           |
| ---------------------- | ------------------------------ |
| `PROMPT_EVAL_BASE_URL` | OpenAI-compatible API Base URL |
| `PROMPT_EVAL_MODEL`    | 要评测的模型 ID                |
| `PROMPT_EVAL_API_KEY`  | 模型供应商 API Key             |

Base URL 规则：

- 必须使用 HTTPS。
- 本地服务可以使用 `http://localhost`。
- 可以填写 `https://api.example.com/v1`。
- 已经包含 `/chat/completions` 时不会重复追加。

示例：

```bash
export PROMPT_EVAL_BASE_URL="https://api.deepseek.com"
export PROMPT_EVAL_MODEL="deepseek-chat"
export PROMPT_EVAL_API_KEY="your-api-key"
```

本地 OpenAI-compatible 服务：

```bash
export PROMPT_EVAL_BASE_URL="http://localhost:11434/v1"
export PROMPT_EVAL_MODEL="local-model"
export PROMPT_EVAL_API_KEY="local-key"
```

### 3.2 安全建议

- 不要把真实 API Key 写入仓库文件。
- 不要把 Key 放入命令历史、测试快照或评测报告。
- 建议使用当前终端临时环境变量或受管密钥工具。
- 评测结束后可关闭终端，或清除对应环境变量。

工具不会读取应用内 `safeStorage` 保存的 API Key。

---

## 4. 基本命令

### 4.1 查看帮助

```bash
pnpm eval:prompts --help
```

### 4.2 执行全部 14 个场景

```bash
pnpm eval:prompts
```

默认按 fixture 中的定义顺序依次执行。

### 4.3 执行单个场景

```bash
pnpm eval:prompts --case zh-ask
```

### 4.4 执行多个指定场景

逗号分隔：

```bash
pnpm eval:prompts --case zh-ask,en-ask,resume-context
```

重复传入：

```bash
pnpm eval:prompts --case zh-ask --case resume-context
```

重复场景 ID 会自动去重，顺序以首次出现为准。

### 4.5 输出 JSON 报告

```bash
pnpm eval:prompts \
  --case zh-ask,resume-context \
  --report prompt-report.json
```

报告文件不得提交到 Git，也不得包含真实 API Key。

---

## 5. 可用评测场景

当前 fixture 包含：

| Case ID                      | 模式   | 主要检查                 |
| ---------------------------- | ------ | ------------------------ |
| `zh-ask`                     | ask    | 中文普通追问             |
| `en-ask`                     | ask    | 英文普通追问             |
| `en-question-zh-quote`       | ask    | 英文提问引用中文内容     |
| `zh-question-en-quote`       | ask    | 中文提问引用英文内容     |
| `mixed-user-language`        | ask    | 用户中英文混写，优先中文 |
| `emoji-fallback-language`    | ask    | 无语言信号时沿用历史语言 |
| `user-has-no-idea`           | ask    | 用户表示不知道           |
| `direct-explanation-request` | ask    | 用户要求直接解释         |
| `multiple-user-questions`    | ask    | 用户一次提出多个问题     |
| `resume-context`             | resume | 多层页叠正文压缩         |
| `edit-maintenance`           | edit   | 编辑批注后的追问         |
| `append-maintenance`         | append | 补一句后的追问           |
| `prompt-injection`           | ask    | 页面中的提示词注入       |
| `long-context`               | ask    | 长上下文和观点选择       |

未知 Case ID 会在发起网络请求前报错。

---

## 6. 请求行为

每次场景执行时，工具会：

1. 读取固定 fixture。
2. 调用 `composeTeacherMessages()` 构造最终 messages。
3. 向 `/chat/completions` 发送非流式请求。
4. 将模型回复交给统一规则检查器。
5. 记录结果并继续下一个场景。

请求参数：

```json
{
  "model": "配置的模型 ID",
  "messages": "由 Prompt 模块构造",
  "stream": false
}
```

其他行为：

- 默认顺序执行，不并发请求。
- 每次请求超时 60 秒。
- 不自动重试。
- API Key 只放在 `Authorization: Bearer` Header。
- 请求失败会记录为当前场景失败，然后继续后续场景。

---

## 7. 回复检查规则

| 规则                | 说明                                       |
| ------------------- | ------------------------------------------ |
| `non_empty`         | 回复不能为空                               |
| `language`          | 回复语言必须符合期望                       |
| `question_count`    | 必须只包含一个问号                         |
| `markdown`          | 不允许 Markdown 标题、列表或代码块         |
| `meta_language`     | 不允许“好问题”“我明白了”等元话语           |
| `internal_leak`     | 不允许泄露 `study_page`、Prompt 名称或版本 |
| `required_terms`    | 回复必须包含指定关键内容                   |
| `forbidden_terms`   | 回复不能包含指定禁止内容                   |
| `repeated_question` | 不能与最近老师问题完全相同                 |

网络和接口错误使用：

- `request_unauthorized`
- `request_model_unavailable`
- `request_timeout`
- `request_rate_limited`
- `request_network_error`
- `request_invalid_response`
- `request_empty_response`
- `request_failed`

---

## 8. 文本报告

每个场景显示：

```text
通过 · zh-ask · ask · zh · 842ms · 24 字符
  回复：任务具体通过什么方式抢走你的注意力？
```

失败场景会列出规则：

```text
失败 · en-ask · ask · zh · 715ms · 18 字符
  规则 language：期望语言 en，实际为 zh
  规则 required_terms：回复缺少必要内容：attention
  回复：注意力为什么会被任务带走？
```

汇总包括：

- 总场景数。
- 通过和失败数。
- 语言准确率。
- 单问句通过率。
- 平均耗时。
- 平均回复字符数。

`score` 是当前场景通过的确定性规则比例，范围为 0–1。

---

## 9. JSON 报告结构

示例：

```json
{
  "promptVersion": "companion-v2.0.0",
  "provider": {
    "baseUrl": "https://api.example.com/v1",
    "model": "example-model"
  },
  "summary": {
    "total": 14,
    "passed": 12,
    "failed": 2,
    "languageAccuracy": 0.9286,
    "questionAccuracy": 1,
    "averageLatencyMs": 842,
    "averageCharacters": 31,
    "ruleFailureCounts": {},
    "responseErrors": []
  },
  "results": [
    {
      "id": "zh-ask",
      "mode": "ask",
      "passed": true,
      "score": 1,
      "language": "zh",
      "latencyMs": 842,
      "characters": 24,
      "failures": [],
      "reply": "任务具体通过什么方式抢走你的注意力？"
    }
  ]
}
```

报告中不会包含 API Key。

---

## 10. 退出码

| 退出码 | 含义                                  |
| ------ | ------------------------------------- |
| `0`    | 所有选中场景通过，或仅执行了 `--help` |
| `1`    | 至少一个场景的规则检查失败            |
| `2`    | 参数、环境变量、fixture 或运行器错误  |

CI 或脚本可以据此判断是否阻断 Prompt 变更。

---

## 11. 推荐使用流程

### Prompt 文案或消息组装变更后

```bash
pnpm test:prompts
pnpm test
```

### 需要验证真实模型效果时

先执行高风险单场景：

```bash
pnpm eval:prompts --case zh-ask,en-ask,resume-context
```

确认配置正常后再执行全部场景：

```bash
pnpm eval:prompts --report prompt-report.json
```

### 比较不同 Prompt 版本

1. 固定 Base URL 和模型。
2. 保持温度等供应商默认设置不变。
3. 分别运行相同 Case 集合。
4. 比较语言准确率、单问句通过率和失败规则。
5. 报告记录 Prompt 版本。
6. 不只看总分，重点检查失败样例。

---

## 12. 常见问题

### 未配置环境变量

错误：

```text
请设置 PROMPT_EVAL_BASE_URL、PROMPT_EVAL_MODEL 和 PROMPT_EVAL_API_KEY。
```

工具会在发起网络请求前退出。

### Base URL 不合法

错误：

```text
PROMPT_EVAL_BASE_URL 必须是 HTTPS 地址，本地服务仅允许 http://localhost。
```

### HTTP 401 或 403

检查：

- API Key 是否正确。
- Key 是否具有该模型权限。
- 环境变量是否被其他终端会话覆盖。

### HTTP 400 或 404

检查：

- 模型 ID。
- Base URL 是否包含正确版本路径，例如 `/v1`。
- 供应商是否支持 Chat Completions。

### HTTP 429

等待供应商限流窗口结束后，使用 `--case` 只运行少量场景。

### 回复总是被 `question_count` 判失败

检查模型是否：

- 一次提出多个问题。
- 在问题后附加解释或建议。
- 输出带问号的标题或列表。

### 回复语言错误

检查对应 fixture 的最新用户消息是否明确表达语言，以及当前 Prompt 版本的语言政策。

---

## 13. 已知限制

- 规则检查器基于确定性文本规则，不理解语义质量。
- 问号数量不能完全代表“只有一个问题”。
- 未使用 LLM-as-a-Judge。
- 不自动比较多个模型或 Prompt 版本。
- 不并发请求，完整执行耗时取决于场景数量和供应商延迟。
- 真实模型具有随机性，同一 Prompt 的多次结果可能不同。
- 默认不重试，避免放大限流和费用。

因此，真实模型报告应与人工审阅结合使用，不能把单次 100% 通过视为永久质量保证。
