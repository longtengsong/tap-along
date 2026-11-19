# Privacy Policy

**Last updated: 2026-11-19**

TapAlong (轻叩伴读) is a local-first desktop app. This document describes what the
app stores, what leaves your Mac, and how to delete it. It applies to the
open-source v0.1.x alpha.

## The short version

- Your notes, conversations, and images are stored **on your Mac**. There is no
  account and no cloud sync.
- The app has **no telemetry, analytics, or crash reporting**.
- Note content is sent to the **model provider you configure** when you ask the
  companion for a question or reply. Search queries are sent to the search
  provider when you use research.
- API keys are encrypted with Electron `safeStorage` (backed by the macOS
  Keychain). The notes database and images are **not** encrypted.
- There is no server operated by the TapAlong project. The maintainers do not
  receive your data.

## What is stored locally

TapAlong uses Electron's `userData` directory, typically:

```text
~/Library/Application Support/TapAlong/
├── tap-along.db              # SQLite: thoughts, conversations, guidance, sources
├── images/                   # images pasted into notes
└── tap-along-settings.json   # provider/search settings and encrypted API keys
```

Depending on your usage, the database can also contain request-inspection records
used by the in-app developer tools (prompt fingerprints, latency, and response
metadata). These records stay local and are not uploaded.

The SQLite database and image files are plain local files. Anyone who can access
your macOS account and read that directory can read them. The app does not
provide full-disk encryption; rely on macOS FileVault and your account security
for that layer.

## What leaves your Mac

TapAlong only makes network requests for features you invoke:

1. **Model requests.** When you ask for a question, reply, title, or other
   generated text, the app sends the relevant note content, conversation
   history, and selected related thoughts to the model provider configured in
   Settings → Model. If you have enabled image input for a multimodal model,
   images in the current context may also be sent. The provider's privacy policy
   and retention rules apply to that data.
2. **Web search.** When research is used, the search query is sent to the
   configured provider — DeepSeek Search by default, or Tavily if you enabled
   it. Search result pages are not fetched by the project's servers, because
   there are none.
3. **Connection tests.** When you press “Test connection”, a small request is
   sent to the provider to verify the endpoint and key.
4. **External links.** Links open in your default browser; the app blocks
   in-app navigation and pop-up windows.

TapAlong does not send data to the TapAlong maintainers and does not include an
automatic update checker in v0.1.0.

## API keys

API keys are encrypted with Electron `safeStorage`, which uses the macOS
Keychain, before being written to `tap-along-settings.json`. Keys are decrypted
in the main process only when a request is made. The app does not log keys and
does not write them to the SQLite database.

If `safeStorage` is unavailable, the app reports that secure storage is
unavailable rather than silently saving a key in plaintext.

## Telemetry, analytics, and crash reports

There are none. The app does not include an analytics SDK, a crash-reporting SDK,
or a remote logging service. Network requests are limited to the provider
endpoints described above.

## Retention and deletion

Your data stays until you delete it. You can:

- Use **Settings → Data & privacy** to export your data or clear local data.
- Quit TapAlong and delete the `userData` folder shown above.

Deleting local data does not delete copies that a third-party model or search
provider may retain under its own policy. Consult that provider's privacy policy
for its retention and deletion options.

## Children

TapAlong is a general-purpose reading and writing tool and is not directed at
children under 13. Do not use the app to submit a child's personal information to
a model provider.

## Changes to this policy

Because the app is an early alpha, this policy may change as features change. The
“Last updated” date at the top will be revised, and material changes will be
noted in [CHANGELOG.md](CHANGELOG.md).

## Contact

Privacy questions can be raised in
[GitHub Discussions](https://github.com/longtengsongislong520/tap-along/discussions)
or a public [issue](https://github.com/longtengsongislong520/tap-along/issues).
Please do not include personal notes or API keys in a public report. Security
issues should follow [SECURITY.md](SECURITY.md) instead.
