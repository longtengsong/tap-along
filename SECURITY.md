# Security Policy

TapAlong is an experimental alpha. Security reports are welcome and will be
handled on a best-effort basis by the maintainers. There is no bug bounty and no
guaranteed response time.

## Supported versions

| Version | Supported   |
| ------- | ----------- |
| 0.1.x   | Yes (alpha) |
| < 0.1   | No          |

Only the latest 0.1.x state of the `main`/`master` branch is supported. There is
no signed installer yet, so fixes are delivered through source updates.

## Reporting a vulnerability

**Do not open a public GitHub issue for a security problem.**

Use GitHub's private vulnerability reporting:

1. Open <https://github.com/longtengsongislong520/tap-along/security/advisories/new>.
2. Describe the issue, its impact, and the steps to reproduce it.
3. If GitHub private reporting is unavailable, open a minimal public issue that
   says only “I have a security report and need a private channel” — do not
   include exploit details, keys, or personal data in it.

Please do not send reports to a personal email address; the project does not
publish one for security contact.

## What to include

- TapAlong version (`package.json` or the app's About/Settings surface) and the
  exact commit if you built from source.
- macOS version and hardware architecture (Apple silicon / arm64).
- A clear description of the impact: what an attacker could read, change, or
  execute.
- Reproduction steps or a proof of concept, with secrets and personal notes
  redacted.
- Whether the issue requires a local attacker, a malicious model endpoint, a
  malicious note file, or another specific precondition.

## Scope

In scope:

- The Electron app's main/renderer boundary, IPC handlers, and preload bridge.
- Local storage of API keys (Electron `safeStorage`) and local data files.
- Prompt-injection or content-injection paths that escape their intended
  boundary.
- External-link handling and navigation restrictions.

Out of scope:

- Vulnerabilities in macOS, Electron, Node.js, or a model/search provider that
  are already fixed upstream.
- Attacks that require an already-unlocked macOS account with full local access
  to the user's files.
- The demo mode behaving as documented (it uses fixed demo lines).
- Social engineering or physical access.

## Disclosure

Please give the maintainers a reasonable opportunity to investigate and ship a
fix before publishing details. Once a fix is available, the advisory will
describe the issue and credit the reporter unless they prefer to stay anonymous.
