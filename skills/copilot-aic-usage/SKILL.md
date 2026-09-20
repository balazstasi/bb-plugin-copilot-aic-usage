---
name: copilot-aic-usage
description: Explain or troubleshoot the Copilot AI Credits header badge in BB.
---

The plugin shows cumulative local AIC/AIU only for `acp-copilot` threads in the supported thread-header action slot. Hover/focus for session premium requests and the latest monthly quota snapshot. AIC is distinct from context-window tokens.

Troubleshoot with the plugin README and `bb plugin list`. Check that SDK 0.4.104+ provides filtered `thread/identity` events and that the thread environment host runs Copilot under the same user/home as its BB daemon. Missing identity, absent checkpoint, or stale telemetry must not be replaced with another session's values.

Never dump Copilot events.jsonl, workspace records, process environments, prompts, responses, reasoning, or tool data into chat or logs. Use the plugin's validated usage RPC for diagnostics. Do not send a model prompt merely to test the meter or mutate Copilot telemetry. There are no plugin settings or custom CLI commands.
