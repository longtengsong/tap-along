# Contributing to TapAlong

Thanks for taking the time to look at TapAlong. It is an early alpha, so small,
focused contributions are the most useful kind: a reproducible bug report, a
fix with a test, a documentation correction, or a careful accessibility pass.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
All contributions are licensed under the [MIT License](LICENSE).

## Before you start

- **Platform:** development currently targets macOS 13+ on Apple silicon
  (arm64). Windows and Linux are not supported yet.
- **Node.js 24+** and **pnpm 11.7.0** (pinned in `packageManager`). With
  Corepack: `corepack enable`.
- **Do not commit real notes, API keys, or personal data.** Use a throwaway
  profile or the demo mode when testing.

```bash
pnpm install
pnpm start
```

## Checks to run before opening a pull request

```bash
pnpm lint        # oxlint + formatting check
pnpm typecheck   # tsc --noEmit
pnpm test        # main-process tests (node:test)
pnpm test:ui     # Vue component tests (Vitest)
```

`pnpm test:e2e` packages the app and runs the Electron smoke tests. It is not
part of CI yet and is optional for most changes; run it if you touched the
packaged startup path.

If `pnpm lint` reports formatting problems, fix them with `pnpm lint:fix`, or
format only the files you touched:

```bash
pnpm exec oxfmt path/to/file
```

## Project layout

| Path              | What lives there                                         |
| ----------------- | -------------------------------------------------------- |
| `src/main/`       | Electron main process: database, IPC, providers, prompts |
| `src/renderer/`   | Renderer entry and the TipTap note editor                |
| `src/components/` | Vue components for the companion, settings, and overlays |
| `src/shared/`     | Types and contracts shared by main and renderer          |
| `tests/`          | `node:test` suites, Vitest UI tests, and E2E smoke tests |
| `tools/prompts/`  | Prompt evaluation and export utilities                   |
| `docs/design/`    | Design, architecture, and prompt-engineering documents   |
| `docs/internal/`  | Historical plans, release reviews, and checklists        |
| `wireframes/`     | Interface wireframes and design screenshots              |

## What to keep intact

TapAlong makes a few promises that changes should not quietly break:

- **The companion asks; it does not write for the user.** Prompts and UI copy
  should not turn it into a ghostwriter.
- **Local-first and no telemetry.** Do not add analytics, crash reporting, or
  background network calls without an explicit discussion in an issue.
- **Secrets stay encrypted.** API keys must go through the existing
  `safeStorage` path; never log them or write them to the database.
- **Both languages stay complete.** User-visible strings belong in
  `src/i18n/locales/en.json` and `zh-CN.json`; keep the parity test passing.
- **Context is visible.** When a question relies on earlier thoughts, the UI
  should keep showing which ones.

## Pull requests

1. Open an issue first for anything larger than a small fix. It avoids work on a
   direction the project is not ready for.
2. Keep the change scoped. Separate refactors from behaviour changes.
3. Add or update tests for behaviour changes. If a bug fix cannot be tested,
   explain why in the PR.
4. Update the relevant docs. Design changes go to `docs/design/`; plans and
   release material go to `docs/internal/`.
5. Fill in the pull request template, including how you tested the change.

Commit messages in this repository follow a light Conventional Commits style,
for example `fix: keep draft after a failed save` or
`docs: move internal plans under docs/internal`.

## Reporting a security issue

Please do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md) and use GitHub's private security advisory flow.

## Questions

Use [GitHub Discussions](https://github.com/longtengsong/tap-along/discussions)
for questions and open-ended ideas.
