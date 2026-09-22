# Copilot AI Credits for BB

See the current GitHub Copilot session's cumulative AI credits (AIC) in a BB thread header. Open the badge for AIC used today on the thread's host, monthly premium requests used against the allowance, and the reset date. The badge updates while the thread is open. Copilot does not publish remaining AIC.

This is an independent community plugin, not affiliated with GitHub, Microsoft, or BB. Local usage data is informational and is not a billing invoice.

## Install

1. In BB's plugin marketplace, install **GitHub Copilot** (`gh-copilot`) and **Copilot AI Credits** (`copilot-aic-usage`). The GitHub Copilot plugin registers the ACP provider used by this plugin.
2. Install [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli) on the machine that runs your BB environment and sign in with a Copilot-enabled account. Copilot and the BB host daemon must run under the same operating-system account and home directory.
3. Start a BB thread with the **GitHub Copilot** provider. The AIC badge appears after Copilot records a usage checkpoint. Older threads using the custom `acp-copilot` provider are also supported.

Requires BB 0.43.4 or newer, Plugin SDK 0.5.9-compatible APIs, Node 22 or newer on the host, and Copilot CLI telemetry compatible with version 1.0.86. For a remote environment, install and sign in to Copilot CLI on that environment's host.

## What the numbers mean

- The header shows cumulative AIC for the current Copilot session, including earlier turns if the session was resumed. It does not show a per-turn amount.
- Today's AIC sums checkpoint increases from Copilot session files on the same host since local midnight. An incomplete scan shows **Unavailable** instead of a partial total.
- The monthly figure is Copilot's latest premium-request usage and allowance. It is separate from AIC. Missing quota data shows **Unavailable**.
- An idle session keeps its last checkpoint. A disconnected BB connection marks the displayed data stale. Open Details for checkpoint times and data notes.

The plugin reads local `~/.copilot/session-state/<session-id>/events.jsonl` files on the thread's host. It reads usage checkpoints and quota fields without sending model requests or changing Copilot files. Prompts and responses are not returned or logged. Data stays in memory; the plugin creates no usage database or telemetry upload.

## Development

```sh
npm ci
npm run check
npm run format:check
```

`npm run check` type-checks, runs the synthetic tests, and builds the server, host, and frontend bundles. `bb plugin types .` checks the installed SDK declarations. The source is in `server.ts`, `host.ts`, `app.tsx`, and `src/`; operating guidance is in `skills/`.

The [BB Community marketplace](https://github.com/get-bb/marketplace) holds the listing and icon. This repository holds the plugin code and its [store overview](PLUGIN_OVERVIEW.md). Releases use immutable `vX.Y.Z` tags; the marketplace tracks compatible releases in the `^0.1.0` range.

MIT licensed.
