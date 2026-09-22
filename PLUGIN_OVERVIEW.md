## What you get

See the current Copilot session's cumulative AI credits in the thread header. Hover or focus the badge to inspect today's local usage, session premium requests, and Copilot's latest monthly premium-request quota.

The badge updates while the thread is open. Missing data stays unavailable, and old checkpoints are marked stale. Daily totals cover Copilot sessions on the same host; incomplete scans show unavailable.

## Requirements

Install GitHub Copilot CLI and sign in with a Copilot-enabled account on the machine running your BB environment. Configure it as BB's custom ACP agent with ID `copilot` and arguments `["--acp"]`. Requires BB 0.43 or newer and compatible Plugin SDK 0.4 APIs.

Follow the [Copilot ACP setup instructions](https://github.com/balazstasi/bb-plugin-copilot-aic-usage#readme).

## Local data

The plugin reads Copilot's local usage checkpoints. It does not send model requests, change Copilot files, or upload telemetry to an external service. BB receives usage values through its host connection. Prompts and responses are not returned or logged.

These figures are local telemetry, not a billing invoice. Copilot does not publish remaining AI credits; monthly remaining figures are premium requests. This independent community plugin is not affiliated with GitHub or Microsoft.
