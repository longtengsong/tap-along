# 发布帖草稿 · TapAlong v0.1.0 alpha

> 用途：首发与后续渠道的帖子底稿。所有渠道共用同一套事实口径，只调整语气和长度。
> 占位符：`{{REPO_URL}}`。发布前必须替换为最终仓库地址；未替换不得发布。
> 字数口径：中文稿按汉字计（不含标点、链接、话题标签），英文稿按英文单词计，均控制在 150–300。

## 0. 统一口径

**一句话定位**

> 轻叩伴读（TapAlong）是一个本地优先的阅读伴读：它先回应你的话，再追问，不替你写；把新念头和你以前的旧念头接起来，剩下的推理留给你。

**必须同时说清的三件事**

1. **它默认先回应，再至多追问一个，不代写。** 回应你的想法，不总结整段、不续写、不生成整篇笔记；聊深了你说收住才换话题，结束权在用户手里。
2. **本地优先，但不是“完全离线”。** 念头、对谈、图片存在本机 SQLite 和本地目录；没有账号、没有同步、没有遥测。生成回应时，相关内容会发送给用户自己配置的模型供应商。
3. **alpha 有硬门槛。** v0.1.0；仅 macOS 13+ / Apple 芯片；没有签名或公证安装包，唯一支持的方式是从源码运行（Node 24、pnpm 11.7.0）。

**一个必须诚实交代的例外**

应用有可选的联网检索（默认 DeepSeek Search，可换 Tavily）。当用户**明确问事实性问题**时，它会查资料、给出带来源的回答。这不是“代写笔记”，但也不能说成“永远不回答”。所有稿子统一用“先回应再追问”“不替你写笔记”，不用“从不回答”。

**可写进文案的事实清单**

- 先回应你说的，再至多追问一个；聊深了你说收住才换话题。引导卡会标出当前念头的锚点句。
- 会从以前写过的念头里检索可能相关的旧念头，并在右侧栏展示它参考了哪些。
- 可以“顺着这条线问”、自由对谈、改一改、补一句、先想到这、翻旧念头。
- 支持粘贴图片、全文浮层和图片查看；图片是否发送给模型可设置。
- 中英文界面；MIT。
- 首次启动可配置模型，或进入有明确标识的演示模式（固定话术）。
- 「设置 → 数据与隐私」可导出全部念头到 `backup.json + images/`；也可清空全部念头与对谈（供应商设置保留）。
- 本地检索用 SQLite FTS5；没有账号、云同步、遥测、崩溃上报。

**不要写**

- “完全离线 / 不需要联网”“数据绝不离开本机”（生成回应会发给模型供应商）。
- “端到端加密”（数据库和图片是明文本地文件）。
- “自动备份 / 可恢复 / 可导入”（只有导出，没有导入/恢复）。
- “一键安装 / 已签名 / 已公证 / 有安装包”。
- “支持 Windows / Linux / 移动端 / 网页版”。
- “云同步 / 账号 / 团队协作 / 自动更新”。
- “AI 替你思考 / 第二大脑 / 效率神器”。
- “求 star / 求支持 / 帮忙冲榜”。

## 渠道与角度

| #   | 渠道            | 受众                        | 语言    | 切入角度                 | 字数                                        |
| --- | --------------- | --------------------------- | ------- | ------------------------ | ------------------------------------------- |
| 1   | V2EX · 分享创造 | 独立开发者、工具爱好者      | 中 / 英 | 为什么反着做；诚实拆限制 | 296 汉字 / 229 词                           |
| 2   | 即刻            | 个人关注者、build in public | 中 / 英 | 轻量自述；一个场景       | 187 汉字 / 170 词                           |
| 3   | 少数派 / Matrix | 效率工具、笔记方法读者      | 中 / 英 | 设计理念与隐私边界       | 299 汉字 / 218 词                           |
| 4   | Show HN         | 英文技术/产品社区           | 英 / 中 | 产品判断；直面限制       | 260 词 / 286 汉字                           |
| 5   | r/macapps       | Mac 用户                    | 英 / 中 | Electron、安装门槛、隐私 | 192 词 / 206 汉字                           |
| 6   | B站 / 小红书    | 短视频观众                  | 中 / 英 | 45–60 秒演示；场景钩子   | B站 205、小红书 192 汉字；英文 155 / 166 词 |

---

## 1. V2EX · 分享创造

**标题**

> 轻叩伴读：一个先回应、再追问、不替你写的本地阅读笔记应用（macOS alpha）

**正文（中文）**

做轻叩伴读，是因为我读书时记下的念头大多死在笔记本里：当时觉得重要，过后再也接不上。

它默认这样做：你记下一个念头，它先回应你的话，再从你以前写过的内容里找出一条可能接得上的旧念头，至多追问一个，让你自己把两者接起来。它不替你总结，不替你续写，也不生成整篇笔记。

一个具体场景：读到「注意力像带宽」，我记下「分配方式可能比总量更值得研究」；它翻出我以前关于「日程被切碎」的念头，问：这两个「分配」说的是同一件事吗？接不接、怎么答，仍由我决定。

（如果你明确问事实性问题，它也可以联网查资料并标注来源；它仍然不替你写笔记。）

现在是 v0.1.0 实验性 alpha，仅 macOS 13+ / Apple 芯片，还没有签名安装包，只能从源码运行（Node 24 + pnpm 11.7.0）。粗糙和破坏性变更都会有。

仓库（MIT）：{{REPO_URL}}

想请你帮个忙：如果你也在读书时记东西，你会拿它做什么？或者哪一步让你卡住了？回帖或 Discussions 都行。

**English version（可转发到 Mastodon / X）**

I built TapAlong because the thoughts I jot down while reading usually die in a notebook. They mattered at the time; later I can't connect them to anything.

By default, TapAlong responds to what you just wrote, retrieves an earlier note that might belong with it, and asks at most one follow-up that helps you connect the two yourself. It doesn't summarize, continue, or draft your notes.

A concrete example: while reading about attention as bandwidth, I write "how it's allocated may matter more than the total." It pulls up an old note about my calendar being chopped into pieces and asks whether these are the same kind of "allocation." Whether to take the thread, and how to answer, is still up to me.

One exception: if you explicitly ask a factual question, it can run optional web research and answer with cited sources. It still won't write your notes for you.

It's v0.1.0, an experimental alpha. macOS 13+ on Apple silicon only; there is no signed installer yet, so the only supported path is building from source (Node 24 + pnpm 11.7.0). Expect rough edges and breaking changes.

Repo (MIT): {{REPO_URL}}

I'd love to hear: if you also take notes while reading, what would you use it for? Or where did it get in your way? Reply here or in Discussions.

**发布备注**：发在「分享创造」节点；标题不要带“求 star”。首段先交代限制，避免“下载链接呢”的误会。可附 10 秒 GIF，完整演示放仓库或视频页。

---

## 2. 即刻

**正文（中文）**

最近在做一个小工具：轻叩伴读 TapAlong。

你读到哪里，记下一个念头；它不替你写，先回应你的话，再从你以前的旧念头里找一条可能接得上的线，至多追问一个。

比如我写「注意力的分配比总量更值得研究」，它翻出「日程被切碎」那条旧念头，问这两个「分配」是不是一回事。剩下的推理留给我。

本地优先：念头、对谈、图片都在本机；没有账号、没有同步、没有遥测。生成回应时，内容会发给我自己配置的模型。

v0.1.0 alpha，仅 macOS 13+ / Apple 芯片；暂无签名安装包，只能从源码跑。

你会拿它做什么？哪里会让你卡住？想听真实用法。

{{REPO_URL}}

**English version**

I've been building a small tool called TapAlong.

You jot down a thought while reading. It doesn't write for you; it responds to what you just said, finds an earlier thought that might connect, and asks at most one follow-up. No summary, no continuation, no draft.

For example, I write "how attention is allocated may matter more than the total," and it pulls up an old note about my calendar being fragmented, asking whether these are the same "allocation." The rest of the thinking stays with me.

Local-first: thoughts, conversations, and images live on my Mac. No account, no sync, no telemetry. When it generates a reply, the content goes to the model provider I configure. If I explicitly ask a factual question, optional web research can answer with sources.

v0.1.0 alpha, macOS 13+ on Apple silicon only; no signed installer, source build only (Node 24, pnpm 11.7.0).

What would you use it for? Where does it get in your way? I want real use, not praise.

{{REPO_URL}}

**发布备注**：配 15 秒竖屏录屏或 GIF；第一行就是定位。即刻外链可能限流，链接放评论区并置顶。

---

## 3. 少数派 / Matrix

**标题**

> 我做了个不替我写字的阅读笔记：先回应，再至多追问一个，然后等我

**正文（中文）**

我一直在找一个不替我写字的笔记工具。

读书时真正难的，往往不是产出，而是把新想法和旧想法接上。轻叩伴读（TapAlong）反过来：你记下一个念头，它先回应你的话，再至多追问一个，把参考的旧念头放在右侧。比如读到「注意力像带宽」，你写下「分配比总量更值得研究」，它翻出旧念头「日程被切碎」，先接一句，再问这两个「分配」是不是一回事。它不总结、不续写、不生成整篇；结束权也在你手里——「先想到这」之后，念头收住，仍能从「翻旧念头」里翻回来。

本地优先：念头、对谈、图片都在本机 SQLite 和本地目录；没有账号、没有同步、没有遥测。只有生成回应时，内容会发给你配置的模型供应商；联网检索可选，只发送搜索关键词。

v0.1.0 实验性 alpha，仅 macOS 13+ / Apple 芯片；没有签名安装包，只能从源码运行（Node 24、pnpm 11.7.0）。数据模型和界面都可能变。

仓库（MIT）：{{REPO_URL}}

想邀请你反馈：你平时怎么回看旧笔记？这种「先回应再追问」的方式，在你身上行得通吗？哪里别扭？

**English version**

I keep looking for a note-taking tool that doesn't write for me.

The hard part of reading isn't output; it's connecting a new thought to an old one. TapAlong goes the other way: you jot down a thought, it responds to what you just wrote, then asks at most one follow-up by default, and it shows the earlier thoughts that question draws on in a side rail. For example, reading about attention as bandwidth, I write "how it's allocated may matter more than the total"; it pulls up an old note about a fragmented calendar, responds, and asks whether these are the same "allocation." It doesn't summarize, continue, or generate a whole note. You also decide when to stop: after "先想到这" (settle this thought), it moves to your closed thoughts and stays readable.

Local-first: thoughts, conversations, and images live in local SQLite and a local folder. No account, no sync, no telemetry. Note content goes to the model provider you configure when it generates a reply; optional web research sends only the search query.

It's v0.1.0 experimental alpha, macOS 13+ on Apple silicon only. No signed/notarized installer; the only supported path is source (Node 24, pnpm 11.7.0).

Repo (MIT): {{REPO_URL}}

I'd like to hear: how do you revisit old notes? Does "responds, then asks" work for you, and where does it feel awkward?

**发布备注**：先发 Matrix，再考虑少数派主站投稿；主站有审稿周期，不保证时间，不要把它算进当天排期。配真实运行截图，并标注“alpha 截图，界面会变”。

---

## 4. Show HN（英文）

**Title**

> Show HN: TapAlong – a local-first reading companion that asks, not answers

**Body**

I built TapAlong because most AI note tools want to write for me. I wanted the opposite: something that helps me connect a new thought to something I wrote months ago, without producing the thought for me.

You jot down a thought while reading. TapAlong responds to what you just wrote, retrieves earlier notes that might belong with it, asks at most one follow-up, and shows those earlier notes in a side rail so the connection isn't a black box. For example, reading about attention as bandwidth, I write that how it's allocated may matter more than the total; it pulls up an old note about a fragmented calendar, responds, and asks whether these are the same "allocation." It won't summarize, continue, or draft your notes. You can edit or append to the thought, close it, and revisit it later.

Notes, conversations, and pasted images live in local SQLite and a local image folder. No account, no sync, no telemetry. When you request a question or reply, the relevant text goes to the model provider you configure (DeepSeek by default, or any OpenAI-compatible endpoint). Optional web research sends only the search query and cites sources.

Status: v0.1.0 experimental alpha, macOS 13+ on Apple silicon only. There is no signed installer yet; the only supported path is building from source (Node 24, pnpm 11.7.0). Rough edges and breaking changes are likely. MIT.

Repo: {{REPO_URL}}

I'd rather hear how you'd use it than whether you like it: what would you point it at, and where does the flow break for you? I'll be in the comments.

**中文对照（内部审阅用，不发布到 HN）**

我做 TapAlong，是因为大多数 AI 笔记工具都想替我写。我想要相反的：帮我把一个新念头和几个月前写过的东西接上，但不替我把这个念头生产出来。

你读书时记下一个念头；它先回应你的话，再检索可能相关的旧念头、至多追问一个，并把那些旧念头放在右侧栏，让连接不是黑箱。它不总结、不续写、不代写笔记。你可以编辑、补一句、收住，再翻回来。

念头、对谈、图片存在本机 SQLite 和本地图片目录；没有账号、没有同步、没有遥测。请求问题时，相关内容会发给你配置的模型供应商（默认 DeepSeek，也支持 OpenAI 兼容端点）。可选的联网检索只发送搜索词，并标注来源。

状态：v0.1.0 实验性 alpha，仅 macOS 13+ / Apple 芯片。尚无签名安装包，唯一支持的方式是从源码构建（Node 24、pnpm 11.7.0）。会有粗糙之处和破坏性变更。MIT。

仓库：{{REPO_URL}}

我更想听你会拿它做什么、流程在哪里断掉，而不是“喜不喜欢”。我会在评论区。

**发布备注**：标题必须以 `Show HN:` 开头；正文不放营销词；美东时间 08:00–09:00 发（北京时间约 21:00–22:00，夏令时约 20:00–21:00）。发完 4 小时内守评论区；不要请人 upvote，不要删帖重发。

---

## 5. r/macapps（英文）

**Title**

> TapAlong: a local-first reading companion that asks questions instead of writing for you (macOS 13+, Apple silicon, alpha)

**Body**

Hi r/macapps — I made TapAlong, a small desktop app for thinking alongside your reading. It's an Electron app, not native Swift, so judge accordingly.

You jot down a thought; TapAlong responds to what you just wrote, retrieves earlier notes that might connect, asks at most one follow-up, and shows those notes in a side rail. Example: a note about attention as bandwidth pulls up an old note about a fragmented calendar, responds, and asks whether both are the same "allocation." It doesn't summarize, continue, or draft your writing. You can edit or append to a thought, close it, and revisit it later.

Thoughts, conversations, and images are stored locally in SQLite and an image folder. No account, no sync, no telemetry. Requests go to the model provider you configure with your own key (DeepSeek by default, or any OpenAI-compatible endpoint); optional research sends only the search query.

It's v0.1.0 alpha, macOS 13+ on Apple silicon only. No signed/notarized installer yet — source build only (Node 24, pnpm 11.7.0). Expect rough edges.

I'm not asking for stars. I'd like to know: what would you use it for, and where does it break for you? Repo: {{REPO_URL}}

**中文对照**

嗨 r/macapps——我做了 TapAlong，一个陪你在阅读时思考的小桌面应用。它是 Electron 应用，不是原生 Swift，请按这个前提评价。

你记下一个念头；它先回应你的话，再检索可能相关的旧念头、至多追问一个，并把那些念头放在右侧栏。它不总结、不续写、不代写。你可以编辑、补一句、收住，再翻回来。

念头、对谈、图片存在本机 SQLite 和图片目录；没有账号、没有同步、没有遥测。请求会发给你自己配置的模型供应商（默认 DeepSeek，也支持 OpenAI 兼容端点）；可选联网检索只发送搜索词。

v0.1.0 alpha，仅 macOS 13+ / Apple 芯片。尚无签名/公证安装包，只能从源码构建（Node 24、pnpm 11.7.0）。会有粗糙之处。

我不求 star。我想知道：你会拿它做什么？哪里会让你卡住？仓库：{{REPO_URL}}

**发布备注**：先读版规的 self-promotion 条款；标题带 macOS 版本和 alpha；正文第一段主动说 Electron。不要只丢链接。

---

## 6. B站 / 小红书短视频配文

### 6.1 B站

**标题建议**

> 【自制】先回应、再追问、不代写的读书笔记 App：轻叩伴读 TapAlong

**简介（中文）**

读书时记下的念头，常常写完就散了。轻叩伴读不替你总结，也不续写；它先回应你的话，再从你以前的旧念头里找一条可能接上的线，至多追问一个。

演示里我写的是「注意力的分配比总量更值得研究」，它翻出我以前关于「日程被切碎」的念头，问这两个「分配」是不是一回事。答案还是我自己写。

本地优先：念头、对谈、图片都在本机；没有账号、没有同步、没有遥测。生成回应时，内容会发给你配置的模型。

v0.1.0 实验性 alpha，仅 macOS 13+ / Apple 芯片，目前没有签名安装包，只能从源码运行。MIT。

你会拿它做什么？哪里卡住？评论区或 GitHub 都行：{{REPO_URL}}

\#读书笔记 #AI工具 #macOS #独立开发

**English caption（可发 YouTube Shorts）**

The thoughts I jot down while reading often scatter the moment I close the book. TapAlong doesn't summarize or continue them; it responds to what you just wrote, finds an earlier thought that might connect, and asks at most one follow-up.

In the demo I write "how attention is allocated may matter more than the total." It pulls up an old note about my calendar being fragmented and asks whether these are the same "allocation." The answer is still mine to write.

Local-first: thoughts, conversations, and images stay on my Mac. No account, no sync, no telemetry. When it generates a reply, the content goes to the model provider I configure.

v0.1.0 experimental alpha, macOS 13+ on Apple silicon only. No signed installer yet; source build only. MIT. The goal is one honest question, not a finished note.

What would you use it for? Where does it get in your way? Comments or GitHub: {{REPO_URL}}

### 6.2 小红书

**标题建议**

> 我做了个「不替我写」的读书笔记 App

**正文（中文）**

我做了个「不替我写」的读书笔记 App。

你只记下一个念头，它先回应你的话，再从旧念头里找可能接得上的线，至多追问一个。不总结、不续写、不生成整篇。

演示场景：读到「注意力像带宽」，我写「分配方式可能比总量更值得研究」；它翻出我以前「日程被切碎」的念头，问：这两个「分配」是一回事吗？

本地优先，没有账号、同步、遥测；生成回应时会发给你自己配置的模型。

v0.1.0 alpha，仅 macOS 13+ Apple 芯片，暂无签名安装包，只能源码运行。

你会拿它做什么？哪里卡住？评论区告诉我。仓库：{{REPO_URL}}（见主页/评论区）。

\#读书笔记 #AI笔记 #macOS #独立开发 #效率工具

**English caption（可发 Instagram / Threads）**

I made a reading-notes app that doesn't write for you.

You jot down one thought; it responds to what you just wrote, finds an earlier thought that might connect, and asks at most one follow-up. No summary, no continuation, no whole-note generation.

Demo: reading "attention is like bandwidth," I write "how it's allocated may matter more than the total." It pulls up an old note about my fragmented calendar and asks whether these are the same "allocation."

Local-first: no account, sync, or telemetry. When it generates a reply, the content goes to the model provider you configure.

v0.1.0 alpha, macOS 13+ Apple silicon only; no signed installer, source build only. It's an Electron app, not native Swift. The point is to keep the thinking yours, not to produce more text. It is deliberately small: the goal is not more text, but a thought you can actually use.

What would you use it for? Where does it get in your way? Repo: {{REPO_URL}} (also in bio/comments).

**发布备注**：B站 16:9，简介放完整链接；小红书 4:5 或 3:4，首图大字写“先回应，再追问，不代写”。小红书外链不可点，链接放主页/评论区并置顶。同一支视频每个平台只发一次。

---

## 发布前最后一遍

- [ ] `{{REPO_URL}}` 全部替换，且未指向私有仓库。
- [ ] 每个渠道只发一次；不发“求 star/求转发/帮忙 upvote”。
- [ ] 首三段内出现“v0.1.0 alpha / macOS 13+ Apple 芯片 / 无签名安装包 / 从源码运行”。
- [ ] 不出现“完全离线”“端到端加密”“可导入/恢复”“有安装包”。
- [ ] 配图/GIF 不含真实笔记、API Key、邮箱、姓名。
- [ ] 反馈 CTA 只问“你会拿它做什么 / 哪里卡住”，不问“喜不喜欢”。
