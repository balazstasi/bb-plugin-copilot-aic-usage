---
name: copilot-aic-usage
description: Explain or troubleshoot the Copilot AI Credits header badge in BB.
---

The plugin shows cumulative local AIC/AIU only for `acp-copilot` and `acp-gh-copilot` threads in the supported thread-header action slot. Open the badge for AIC used today on this host, premium requests used this month as a percentage of the allowance, and the reset date. Expand Details for timestamps and data notes. Copilot does not publish remaining AIC. AIC is distinct from context-window tokens. Today must not replace the current session’s AIC.

Troubleshoot with the plugin README and `bb plugin list`. Check that SDK 0.5.9+ provides filtered `thread/identity` events and that the thread environment host runs Copilot under the same user/home as its BB daemon. A saved checkpoint remains available in an idle session; only a lost BB connection marks the cached badge stale. Missing identity or checkpoint must not be replaced with another session's values.

Never dump Copilot events.jsonl, workspace records, process environments, prompts, responses, reasoning, or tool data into chat or logs. Use the plugin's validated usage RPC for diagnostics. Do not send a model prompt merely to test the meter or mutate Copilot telemetry. There are no plugin settings or custom CLI commands.
