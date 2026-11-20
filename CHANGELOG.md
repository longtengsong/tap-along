# Changelog

All notable changes to TapAlong (轻叩伴读) are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-11-19

Initial public alpha. macOS 13+ on Apple silicon (arm64) only.

### Added

- Local-first thoughts and conversations backed by SQLite, with FTS5 retrieval
  and short-query fallback.
- A companion that asks one question at a time, opens with a related thought when
  it can, and keeps the current thought's anchor sentence in view.
- Session-thoughts rail that shows which earlier thoughts a conversation is
  drawing on, including thoughts from other notes.
- Click-to-ask, free-form conversation, editing a thought and refreshing
  guidance, and a “翻旧念头” (revisit closed thoughts) list with read-only detail.
- Optional web research with source citations, using DeepSeek Search by default
  and Tavily as an alternative.
- Note documents with a TipTap editor, pasted-image support (compression, local
  image store, lightbox, full-text overlay), and the `tap-image://` protocol.
- Export/backup to JSON, image cleanup, draft auto-save, and a readable startup
  error screen when the database cannot be opened.
- First-run setup: configure a model provider or enter a clearly labelled demo
  mode. DeepSeek is the default provider; a custom OpenAI-compatible endpoint is
  supported.
- Encrypted API key storage through Electron `safeStorage` (macOS Keychain),
  connection tests, and provider/search settings.
- English and Simplified Chinese interfaces with a locale-parity test.
- Developer mode: editable prompts, request-inspection records, and a prompt
  evaluation/export tool under `tools/prompts/`.
- macOS packaging configuration with the TapAlong / 轻叩伴读 name, bundle ID,
  icon, and Electron fuses.

### Changed

- Product language is now 念头 / 伴读 / 收住, replacing the earlier
  page-margin / annotation / teacher vocabulary.
- Release metadata is aligned to `0.1.0`; the repository is prepared for public
  distribution under MIT.

### Security

- `contextIsolation` on, `nodeIntegration` off, external links restricted, and
  API keys encrypted at rest.

### Known limitations

- No signed or notarized installer is published; building from source is the only
  supported path.
- Windows and Linux are untested.
- Data model, prompts, and UI may change without migration guarantees.

[Unreleased]: https://github.com/longtengsong/tap-along/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/longtengsong/tap-along/releases/tag/v0.1.0
