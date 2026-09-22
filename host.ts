import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { hostContract, hostSignals } from "./src/contract";
import { UsageMonitor } from "./src/monitor";

export function createUsageHostEntry(root: string) {
  let monitor: UsageMonitor | undefined;

  return experimental_defineHostEntry({
    contract: hostContract,
    experimental_signals: hostSignals,
    handlers: {
      read: (target, context) => {
        if (!monitor || monitor.disposed)
          monitor = new UsageMonitor(root, context);

        return monitor.read(target);
      },
    },
    dispose: async () => {
      await monitor?.dispose();
      monitor = undefined;
    },
  });
}

export default createUsageHostEntry(
  join(homedir(), ".copilot", "session-state"),
);
