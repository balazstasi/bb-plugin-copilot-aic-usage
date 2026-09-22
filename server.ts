import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  emptyUsage,
  hostContract,
  hostSignals,
  rpcContract,
  USAGE_CHANGED,
} from "./src/contract";
import { selectSession } from "./src/identity";

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({
    contract: hostContract,
    experimental_signals: hostSignals,
  });
  const subscriptions = new Map<
    string,
    { hostId: string; sessionId: string; touched: number }
  >();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const publish = (threadId: string) =>
    bb.realtime.publish(USAGE_CHANGED, { threadId });
  const unsubscribe = host.experimental_onSignal(
    "changed",
    ({ hostId, payload }) => {
      const expected = subscriptions.get(payload.threadId);
      if (
        expected?.hostId === hostId &&
        expected.sessionId === payload.sessionId &&
        Date.now() - expected.touched < 90_000
      )
        publish(payload.threadId);
    },
  );
  const unsubscribeExit = host.experimental_onWorkerExit(({ hostId }) => {
    for (const [id, target] of subscriptions)
      if (target.hostId === hostId) publish(id);
  });
  bb.events.on("experimental_thread.events", ({ thread }) => {
    if (!subscriptions.has(thread.id) || pending.has(thread.id)) return;
    const timer = setTimeout(() => {
      pending.delete(thread.id);
      if (Date.now() - (subscriptions.get(thread.id)?.touched ?? 0) < 90_000)
        publish(thread.id);
      else subscriptions.delete(thread.id);
    }, 2000);
    timer.unref();
    pending.set(thread.id, timer);
  });
  bb.rpc.register(rpcContract, {
    usage: async ({ threadId }) => {
      let supported = false;
      try {
        const thread = await bb.sdk.threads.get({
          threadId,
          include: "environment",
        });
        if (
          thread.providerId !== "acp-copilot" &&
          thread.providerId !== "acp-gh-copilot"
        ) {
          subscriptions.delete(threadId);
          return emptyUsage("unsupported-provider", false);
        }
        supported = true;
        const environment = "environment" in thread ? thread.environment : null;
        if (!environment?.hostId) return emptyUsage("missing-host");
        // Server-side filter: prompts, responses and tool events are never fetched.
        const identities = await bb.sdk.threads.events.list({
          threadId,
          types: ["thread/identity"],
          order: "desc",
          limit: "2",
        });
        const selected = selectSession(
          identities.filter((row) => row.type === "thread/identity"),
        );
        for (const [id, target] of subscriptions)
          if (Date.now() - target.touched > 90_000) subscriptions.delete(id);
        if (!subscriptions.has(threadId) && subscriptions.size >= 256)
          return emptyUsage("capacity");
        subscriptions.set(threadId, {
          hostId: environment.hostId,
          sessionId: "sessionId" in selected ? selected.sessionId : "",
          touched: Date.now(),
        });
        if ("reason" in selected) return emptyUsage(selected.reason);
        return await host.call(
          "read",
          { threadId, sessionId: selected.sessionId },
          { hostId: environment.hostId },
        );
      } catch {
        return emptyUsage("host-unavailable", supported);
      }
    },
  });
  bb.onDispose(() => {
    unsubscribe();
    unsubscribeExit();
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    subscriptions.clear();
  });
}
