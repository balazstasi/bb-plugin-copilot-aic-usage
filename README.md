# Copilot AI Credits for BB

Displays the **current Copilot ACP session’s cumulative AI credits (AIC / AIU)** in BB’s thread header. Hover or keyboard-focus the value for premium requests, the latest monthly remaining percentage, reset date, and freshness information. Updates arrive without refreshing the page. Only `acp-copilot` threads display the control.

Independent community plugin. Not affiliated with or endorsed by GitHub, Microsoft, or BB. Local telemetry is informational, not a billing invoice.

## Requirements and installation

- BB 0.43 or newer with Plugin SDK **0.4.104** APIs (`>=0.4.104 <0.5`). Experimental APIs may change; the exact development SDK is pinned.
- Node 22 or newer for development and the BB host daemon.
- GitHub Copilot CLI telemetry compatible with **1.0.86**, launched by BB as `copilot --acp`.
- Copilot and the BB environment’s host daemon must use the same operating-system account/home directory on that host. The BB server may be on another machine.

### One-command local installation

Copy or clone this complete repository onto the Mac that runs BB. From the repository root, run:

```sh
./scripts/install-local.sh
```

If the executable bit was lost while copying the folder, use:

```sh
bash scripts/install-local.sh
```

The script checks its prerequisites, installs dependencies reproducibly, type-checks and tests the plugin, builds all BB artifacts, and then installs it from the repository's absolute local path. It is safe to run again: an installation from the same checkout is rebuilt, enabled, and reloaded; an existing installation from a different local checkout is moved to this one using BB's normal installation command.

To delegate installation to an agent on another Mac, give it the repository and say: **“Read `README.md` and follow the one-command local installation instructions.”** The script does not send a Copilot prompt, alter Copilot telemetry, or require organization-admin access.

Manual equivalent:

```sh
cd bb-plugin-copilot-aic-usage
npm ci
npm run typecheck
npm test
npm run build
bb plugin install "path:$PWD" --yes
```

The local install points at this checkout. Open an existing Copilot ACP thread: no extra credentials, organization permissions, model request, or Copilot restart are required. A thread with no recorded Copilot identity/checkpoint shows an unavailable/pending state.

For development:

```sh
bb plugin dev .
# In another terminal:
npm test
# After a manual build:
bb plugin reload copilot-aic-usage
```

`bb plugin list` reports plugin health. The plugin intentionally logs no telemetry. Disable with `bb plugin disable copilot-aic-usage`; remove with `bb plugin remove copilot-aic-usage` (the checkout remains).

## UI and meaning

The supported `experimental_threadHeaderAction` slot places the badge in the **thread header action row**. SDK 0.4.104 has no public slot directly beside the existing context-window circle. This plugin uses no DOM injection, global selectors, core patches, or context-token substitution. Exact placement beside the circle requires a BB UI slot addition.

The telemetry reader preserves `totalNanoAiu / 1_000_000_000` exactly, but the badge displays the nearest natural number using ordinary half-up rounding. For example, `1.123123` is displayed as `1 AIC`, `1.51` as `2 AIC`, and `10831717000` as `11 AIC`. Zero is displayed only after an actual checkpoint below `0.5 AIC`. Counts are cumulative for the Copilot session, including earlier turns if that session was resumed. They are not per-turn deltas or the sum of historical BB sessions.

The hover details distinguish current-session premium requests from the monthly quota snapshot. Monthly quota can lag and may include other sessions. Missing fields read “Unavailable.” A checkpoint older than five minutes, a missing live process lock, or a disconnected BB realtime connection produces a stale state. An idle session can legitimately be stale. Checkpoint and monthly-snapshot timestamps are shown separately.

## Architecture and exact correlation

1. `server.ts` resolves the requested BB thread using the public SDK, checks `providerId === "acp-copilot"`, and obtains `environment.hostId`.
2. It requests **only** the two latest `thread/identity` events, using server-side event-type filtering, descending sequence, and a limit. No conversation history is fetched.
3. `thread/identity.data.providerThreadId` is the ACP `sessionId`: current BB ACP bridge source assigns the session/new or session/load ID and emits threadIdentity. The latest BB identity is authoritative, including after resume/reset/fork. It must be a UUID. Missing, invalid, or conflicting latest identities fail closed; there is no workspace/time heuristic and no fallback to an older session.
4. Typed host RPC targets that environment’s enrolled host. `host.ts` reads only `~/.copilot/session-state/<exact-session-id>/events.jsonl` on that machine. No assumption equates the server machine with the Copilot machine.
5. Each session directory gets a daemon-native filesystem watch. A bounded incremental reader extracts only checkpoint/quota fields. `inuse.<pid>.lock` plus process existence informs freshness, **never identity selection**. Workspace files and process environments are unnecessary and are not read.
6. A usage change emits a validated host invalidation containing only thread/session IDs. The server checks the originating host and expected session before forwarding a thread-only realtime invalidation. The mounted header action refetches its typed snapshot.

Each frontend pane renews its subscription every 30 seconds, recovering missed signals or host restarts. The host reconciles every 15 seconds, retries failed watches, and expires subscriptions after 90 seconds without reads. Up to 64 viewed threads per host worker and 256 server subscriptions are supported. Watches, timers, file handles, and worker leases are disposed on expiry/reload/disable. Multiple windows renew the same thread subscription without prematurely closing each other’s watch.

## Permissions and privacy

This is a **full-trust BB plugin**, as host entries generally are; the code’s read restrictions are not an operating-system sandbox.

- Reads local Copilot event files only on the explicitly resolved thread host. No writes to Copilot files, no Copilot subprocess, no organization metrics API, no external network requests, no credentials requested.
- JSONL records are processed individually in memory and discarded. Only numeric usage, validated timestamps, explicitly named quota booleans, and session-correlation IDs cross module/RPC boundaries. Prompts, responses, reasoning, code, tool data, arbitrary fields, and raw parse errors are never returned, persisted, or logged.
- Reads at most the newest **8 MiB** per reconciliation, in **64 KiB** chunks. Individual records/torn-line buffers are capped at **256 KiB**; oversized records are skipped to the next newline. A partial final line is held only in bounded volatile memory until completed.
- Latest usage and read offsets exist only in memory. No plugin database, disk cache, analytics, telemetry upload, or usage logs are created. BB transports usage snapshots to its own authenticated frontend; realtime broadcasts carry only IDs.
- Event files are opened with `O_NOFOLLOW`; symlink session directories are rejected. RPC callers supply a BB thread ID, never a path or host selection. Host RPC accepts only validated thread/UUID session identifiers.
- File inode/size changes and first/last 4 KiB fingerprints detect rotation, truncation, and typical truncate-regrow replacement. Raw fingerprints are hashes, not retained content.

## Compatibility and limitations

- Copilot’s local event format is an observed CLI implementation detail, not a guaranteed billing API. Unknown schemas yield unavailable data. Numeric nano-AIU values above JavaScript’s safe integer range are rejected; integer strings up to 30 digits convert exactly.
- The reader uses the newest checkpoint in the bounded tail. If a checkpoint or quota snapshot is outside that tail or exceeds the line cap, the corresponding value is unavailable until a new valid record arrives. It never reconstructs totals from prompts or sums model-call deltas.
- The telemetry stream is assumed append-only between rotations. Arbitrary in-place edits solely in the middle of a large consumed file may evade the bounded fingerprints; ordinary truncate/replace and torn append cases are tested.
- Latest identity means the most recently recorded Copilot session. A stopped session can still show its cumulative total marked stale. BB provider changes are rechecked on every request.
- Default Copilot home location only; custom Copilot home directories and non-UUID session IDs are not supported. macOS is live-verified; host routing and remote failures are covered with SDK harness tests, but a second physical host and Windows have not been live-verified.
- `--usage-output-file` is not used because it reports final-session output. ACP `usage_update` is not used because it describes context-window usage.
- A public provider identity API is **not** a blocker on SDK 0.4.104: the filtered identity event API supplies the exact identifier. A dedicated stable identity endpoint would reduce experimental API dependence. Direct circle adjacency requires a new frontend slot.

## Validation and repository layout

```sh
bb plugin types .
npm run typecheck
npm test                 # parser, reader, identity, host/server RPC and frontend
bb plugin build .        # server, host and frontend bundles + metadata
npm pack --dry-run       # inspect the distributable
```

The test suite runs the SDK public-import scanner and the official backend, host, and frontend harnesses. All committed fixtures are synthetic. See [VERIFICATION.md](VERIFICATION.md) for the actual validation and live-check record.

- `server.ts`: thread/provider checks, environment-host routing, identity lookup, RPC/realtime.
- `host.ts`, `src/monitor.ts`, `src/reader.ts`: host worker, watcher lifecycle, bounded incremental reading.
- `src/model.ts`, `src/contract.ts`: strict wire schemas and typed contracts.
- `src/telemetry.ts`, `src/identity.ts`: privacy projection, precision, exact selection.
- `app.tsx`, `src/UsageBadge.tsx`: supported header slot and hover/focus UI.
- `scripts/install-local.sh`: idempotent local build, verification, install, and reload workflow.
- `tests/`: synthetic functional/privacy/lifecycle tests; `skills/`: operating guidance.

## Publishing later

This repository has no configured remote and is not published. Before release, add your repository/bugs/homepage metadata and maintainer details, review the license, and add a screenshot of a synthetic/demo session (avoid capturing private conversations or account information). Screenshot placeholder: [docs/screenshots/README.md](docs/screenshots/README.md).

For a Git-based BB install, publish the source, lockfile, manifest, license, and README. BB runs production dependency installation and builds declared entries; runtime dependencies are in `dependencies`, and SDK/React/shim declarations and test tools are development dependencies. The SDK root helpers used by the host are bundled by BB’s host builder.

For npm, run `bb plugin build` first, inspect `npm pack --dry-run`, and publish the generated `dist/` artifacts with their matching metadata. `files` includes those artifacts even though `dist/` is Git-ignored. Check the neutral package name’s availability before publishing. Do not rename the package after building without rebuilding: artifact identity must match the manifest.

BB Community marketplace submission is a separate opt-in review; a public repository alone does not list the plugin. Follow the installed `submit-a-plugin` skill when ready. No external publication or marketplace submission is performed by this checkout’s setup.

MIT licensed.
