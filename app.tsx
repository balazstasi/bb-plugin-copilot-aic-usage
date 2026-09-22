import type { rpcContract } from "./src/contract";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { realtimeSchema, USAGE_CHANGED, type Usage } from "./src/model";
import { UsageBadge } from "./src/UsageBadge";

function UsageAction({
  threadId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [state, setState] = useState<{ threadId: string; usage: Usage } | null>(
    null,
  );
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    let running = false;
    let again = false;

    const refresh = async () => {
      if (running) {
        again = true;
        return;
      }

      running = true;
      do {
        again = false;

        try {
          const usage = await rpc.call("usage", { threadId });
          if (alive) setState({ threadId, usage });
        } catch {
          if (alive)
            setState((previous) =>
              previous?.threadId === threadId
                ? {
                    threadId,
                    usage: {
                      ...previous.usage,
                      status: "stale",
                      reason: "connection-lost",
                    },
                  }
                : null,
            );
        }
      } while (again && alive);

      running = false;
    };

    refreshRef.current = () => {
      void refresh();
    };
    void refresh();

    const timer = setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      alive = false;
      clearInterval(timer);
      refreshRef.current = () => {};
    };
  }, [rpc, threadId]);

  const onChanged = useCallback(
    (payload: unknown) => {
      const parsed = realtimeSchema.safeParse(payload);
      if (parsed.success && parsed.data.threadId === threadId)
        refreshRef.current();
    },
    [threadId],
  );
  useRealtime(USAGE_CHANGED, onChanged);

  useEffect(() => {
    if (connection === "connected") refreshRef.current();
  }, [connection]);

  if (!state || state.threadId !== threadId || !state.usage.supported)
    return null;

  const usage =
    connection === "connected"
      ? state.usage
      : {
          ...state.usage,
          status: "stale" as const,
          reason: "connection-lost" as const,
        };

  return <UsageBadge usage={usage} compact={isCompactViewport} />;
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "copilot-aic",
    title: "Copilot AI credits",
    component: UsageAction,
  });
});
