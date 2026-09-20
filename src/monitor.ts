import { join } from "node:path";
import type {
  ExperimentalHostRpcContext,
  ExperimentalHostWatchSubscription,
} from "@get-bb/plugin-sdk";
import {
  emptyUsage,
  type Target,
  type Usage,
  type hostSignals,
} from "./contract";
import { SessionReader } from "./reader";

type Context = ExperimentalHostRpcContext<typeof hostSignals>;
type Entry = {
  target: Target;
  reader: SessionReader;
  touched: number;
  value?: Usage;
  watch?: ExperimentalHostWatchSubscription;
  watching?: Promise<void>;
  flight?: Promise<Usage>;
  removed: boolean;
};
const signature = ({ checkedAt: _checkedAt, ...usage }: Usage) =>
  JSON.stringify(usage);

/** Only viewed threads are watched; leases expire when all their panes disappear. */
export class UsageMonitor {
  private entries = new Map<string, Entry>();
  private reads = new Map<string, Promise<Usage>>();
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;
  private reconciling = false;
  private lease;
  constructor(
    private root: string,
    private context: Context,
  ) {
    this.lease = context.experimental_retainWorker();
    this.timer = setInterval(() => {
      void this.reconcile();
    }, 15_000);
    this.timer.unref();
  }
  read(target: Target): Promise<Usage> {
    // Split panes and rapid identity changes can issue overlapping RPCs. Serialize
    // one thread's mutations while allowing other sessions to proceed independently.
    const previous = this.reads.get(target.threadId) ?? Promise.resolve();
    const result = previous.then(
      () => this.readTarget(target),
      () => this.readTarget(target),
    );
    this.reads.set(target.threadId, result);
    const cleanup = () => {
      if (this.reads.get(target.threadId) === result)
        this.reads.delete(target.threadId);
    };
    void result.then(cleanup, cleanup);
    return result;
  }
  private async readTarget(target: Target): Promise<Usage> {
    if (this.stopped) return emptyUsage("host-unavailable");
    let entry = this.entries.get(target.threadId);
    if (entry && entry.target.sessionId !== target.sessionId) {
      await this.remove(entry);
      entry = undefined;
    }
    if (!entry) {
      if (this.entries.size >= 64) return emptyUsage("capacity");
      entry = {
        target,
        reader: new SessionReader(join(this.root, target.sessionId)),
        touched: Date.now(),
        removed: false,
      };
      this.entries.set(target.threadId, entry);
    }
    entry.touched = Date.now();
    await this.ensureWatch(entry);
    return this.refresh(entry);
  }
  private async ensureWatch(entry: Entry): Promise<void> {
    if (entry.watching) return entry.watching;
    if (entry.watch || entry.removed || this.stopped) return;
    entry.watching = (async () => {
      try {
        const subscription = await this.context.experimental_watch(
          {
            rootPath: entry.reader.directory,
            debounceMs: 100,
            maxWaitMs: 500,
          },
          async (event) => {
            if (entry.removed || this.stopped) return;
            if (event.kind === "watch-error") {
              const watch = entry.watch;
              entry.watch = undefined;
              void watch?.dispose().catch(() => {});
            }
            if (entry.flight) await entry.flight;
            await this.refresh(entry);
          },
        );
        if (entry.removed || this.stopped) await subscription.dispose();
        else entry.watch = subscription;
      } catch {
        /* Retry missing directory or failed watcher on reconciliation. */
      }
    })().finally(() => {
      entry.watching = undefined;
    });
    return entry.watching;
  }
  private refresh(entry: Entry): Promise<Usage> {
    if (entry.flight) return entry.flight;
    if (entry.removed || this.stopped)
      return Promise.resolve(emptyUsage("host-unavailable"));
    entry.flight = (async () => {
      const value = await entry.reader.read();
      const changed =
        entry.value !== undefined &&
        signature(entry.value) !== signature(value);
      entry.value = value;
      if (changed && !entry.removed && !this.stopped) {
        try {
          await this.context.experimental_emitSignal("changed", entry.target);
        } catch {
          /* heartbeat recovers */
        }
      }
      return value;
    })().finally(() => {
      entry.flight = undefined;
    });
    return entry.flight;
  }
  private async reconcile() {
    if (this.reconciling || this.stopped) return;
    this.reconciling = true;
    try {
      for (const entry of this.entries.values()) {
        if (this.stopped) return;
        if (Date.now() - entry.touched > 90_000) {
          await this.remove(entry);
          continue;
        }
        await this.ensureWatch(entry);
        await this.refresh(entry);
      }
      if (!this.entries.size) await this.dispose();
    } finally {
      this.reconciling = false;
    }
  }
  get disposed() {
    return this.stopped;
  }
  private async remove(entry: Entry) {
    entry.removed = true;
    if (this.entries.get(entry.target.threadId) === entry)
      this.entries.delete(entry.target.threadId);
    await entry.watching;
    await entry.watch?.dispose().catch(() => {});
    await entry.flight;
  }
  async dispose() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.all(
      [...this.entries.values()].map((entry) => this.remove(entry)),
    );
    await this.lease.dispose();
  }
}
