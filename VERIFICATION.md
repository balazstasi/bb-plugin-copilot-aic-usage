# Verification record

Verified locally on 2026-09-20 with BB **0.43.3**, Plugin SDK **0.4.104**, Node **22.23.1**, and Copilot CLI telemetry from **1.0.86**. All repository test fixtures are synthetic; no real session identifiers, conversation content, or account quota snapshots are stored here.

## Commands and results

| Check                                                                                                                 | Result                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bb plugin new copilot-aic-usage`                                                                                     | Scaffold created; example todo implementation removed.                                                                               |
| `bb plugin types .`                                                                                                   | Exact SDK 0.4.104 and host-shim declarations already current.                                                                        |
| `npm ci`                                                                                                              | Successful reproducible install using the committed lockfile; zero reported vulnerabilities.                                         |
| `npm run typecheck`                                                                                                   | Passed, including host/server/frontend and tests.                                                                                    |
| `npm test`                                                                                                            | **55 tests passed in 6 files**, Vitest 4.1.11.                                                                                       |
| SDK `experimental_scanPublicSdkOnly`                                                                                  | Passed inside the test suite: zero violations and zero private dependencies.                                                         |
| `npm run format:check`                                                                                                | Passed for all TypeScript and TSX files.                                                                                             |
| `bb plugin build .`                                                                                                   | Passed: server, app/CSS and host bundles plus all metadata and server/host maps.                                                     |
| Production-only temporary checkout: `npm ci --omit=dev --omit=optional`, then `bb plugin build <temporary-directory>` | Both passed. Only the runtime Zod dependency was installed. Temporary artifacts were removed.                                        |
| `bb plugin install . --yes`                                                                                           | Installed local path source; status `running`.                                                                                       |
| `bb plugin reload copilot-aic-usage`                                                                                  | Passed; status `running`.                                                                                                            |
| `npm pack --dry-run --json`                                                                                           | Confirmed manifest, sources, documentation, skill, license, and built artifacts; no tests, node_modules, secrets, or real telemetry. |
| `git diff --cached --check`                                                                                           | Passed before initial commit.                                                                                                        |

An initial npm 10 dependency resolution attempt crashed while updating Vitest’s optional peers. Resolving once with `npx --yes npm@11 install` produced the lockfile; a subsequent ordinary npm 10 `npm ci` succeeded. No `legacy-peer-deps` or forced resolution is required. The final dependency audit reported zero vulnerabilities.

## Test coverage

- Exact decimal nano-AIU conversion, sub-credit precision, unsafe numbers and malformed input.
- Explicit event-field projection and unknown-field exclusion; strict RPC schemas; no raw parse errors.
- Every split point of a JSONL record; partial/oversized/malformed lines; reset and recovery.
- Bounded large-file tails, incremental appends, rename rotation, truncation and truncate-regrow, missing files, symlink refusal, lock/timestamp stale states.
- Latest exact session identity; absent/invalid/conflicting identities; no old-session fallback.
- Remote environment-host RPC routing and server-side identity-event filtering; unsupported/unknown providers hidden; bounded host errors.
- Host/session-scoped realtime invalidations and rejection of obsolete or wrong-host signals.
- Concurrent sessions, rapid identity changes, filesystem watcher notifications, actual temporary-file appends, reconciliation after watcher failure, expiry and worker-lease cleanup.
- Host-wide today AIC from local midnight checkpoint deltas; incomplete scans report unavailable; unterminated checkpoints ignored; symlink session directories refused.
- Supported header-slot registration, half-up natural-number display, hover/focus/Escape details including today and monthly remaining, unavailable/stale/unsupported states, scoped realtime refetch and reconnect state.

## Live checks

The real BB thread’s latest public `thread/identity` value matched an existing Copilot session directory. The installed plugin’s real server RPC invoked its bundled host entry and returned the expected whitelisted scalar usage and quota fields.

In a temporary ego-browser task, the running BB frontend displayed the cumulative AIC value. Hovering showed session premium requests, monthly remaining percentage, UTC reset date, and separate checkpoint/quota timestamps. The old checkpoint was correctly labeled stale. Layout inspection found no clipping ancestors for the open tooltip. At a 420-pixel viewport the compact numeric badge stayed inside the viewport. The browser task was closed afterward.

No model prompt was sent, no charged request was generated, and no real Copilot files were changed. A new real Copilot checkpoint was **not** observed during verification. Automatic append → host signal and signal → UI refresh were verified with synthetic filesystem and SDK/frontend harness tests, rather than claimed as a naturally occurring live billed update.

Local plugin installation remains enabled for the user. A second physical host, Windows, and a real disconnection/reconnect were not exercised; host routing, error handling and connection-state rendering were covered in tests.

## Remaining boundaries

- Exact circle adjacency requires a new BB frontend slot. The supported thread-header action row works now.
- No provider-identity API change is required with SDK 0.4.104: filtered identity events give the exact ACP session ID.
- Copilot telemetry format/home/UUID assumptions, read/line caps, freshness policy, and bounded fingerprint limitations are documented in the README.
- Fresh marketplace screenshot capture is pending BB Computer Use access.

## Release review (2026-09-22)

The strict code-quality review retained the existing host/server/frontend split and fixed daily-total correctness without introducing a new service or storage layer. Daily scans now report unavailable when bounded work cannot produce a complete total, ignore unterminated checkpoints, and reject a pre-midnight session without a usable baseline. Viewed threads share a 15-second daily scan; filesystem notifications invalidate it. Nano-AIU validation now has one implementation.

`npm run check` passes with 59 tests in six files, TypeScript validation, and all BB bundles. `npm run format:check` and `git diff --check` pass. The native filesystem watcher test requires execution outside the macOS agent sandbox; it passed there. The earlier live-check section records prior verification, not a fresh visual review of this release. New screenshot capture was blocked by Computer Use permission for BB.

The README's ACP setup was checked against `bb guide providers`, the existing `provider-acp` custom-agent setting, and installed Copilot CLI 1.0.87. No model request was sent.
