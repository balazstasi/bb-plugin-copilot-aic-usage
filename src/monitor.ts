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
import { readTodayAic } from "./daily";
import { SessionReader } from "./reader";

type Context = ExperimentalHostRpcContext<typeof hostSignals>;

type WatchState =
  | { kind: "idle" }
  | { kind: "starting"; promise: Promise<void> }
  | { kind: "active"; subscription: ExperimentalHostWatchSubscription };

type Entry = {
  target: Target;
  reader: SessionReader;
  touched: number;
  value?: Usage;
  watch: WatchState;
  flight?: Promise<Usage>;
  removed: boolean;
};

const RECONCILE_MS = 15_000;
const SUBSCRIPTION_TTL_MS = 90_000;
const MAX_SUBSCRIPTIONS = 64;

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
  private today?: { expires: number; value: ReturnType<typeof readTodayAic> };

  constructor(
    private root: string,
    private context: Context,
  ) {
    this.lease = context.experimental_retainWorker();
    this.timer = setInterval(() => {
      void this.reconcile();
    }, RECONCILE_MS);
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

  get disposed() {
    return this.stopped;
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

  private readToday() {
    if (!this.today || Date.now() >= this.today.expires) {
      this.today = {
        expires: Date.now() + RECONCILE_MS,
        value: readTodayAic(this.root),
      };
    }

    return this.today.value;
  }

  private async readTarget(target: Target): Promise<Usage> {
    if (this.stopped) return emptyUsage("host-unavailable");

    let entry = this.entries.get(target.threadId);
    if (entry && entry.target.sessionId !== target.sessionId) {
      await this.remove(entry);
      entry = undefined;
      if (this.stopped) return emptyUsage("host-unavailable");
    }

    if (!entry) {
      if (this.entries.size >= MAX_SUBSCRIPTIONS) return emptyUsage("capacity");
      entry = {
        target,
        reader: new SessionReader(join(this.root, target.sessionId)),
        touched: Date.now(),
        watch: { kind: "idle" },
        removed: false,
      };
      this.entries.set(target.threadId, entry);
    }

    entry.touched = Date.now();
    await this.ensureWatch(entry);
    return this.refresh(entry);
  }

  private async ensureWatch(entry: Entry): Promise<void> {
    if (entry.watch.kind === "starting") return entry.watch.promise;
    if (entry.watch.kind === "active" || entry.removed || this.stopped) return;

    const promise = (async () => {
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
              if (entry.watch.kind === "active") {
                const { subscription } = entry.watch;
                entry.watch = { kind: "idle" };
                void subscription.dispose().catch(() => {});
              }
            }

            if (entry.flight) await entry.flight;
            this.today = undefined;
            await this.refresh(entry);
          },
        );
        if (entry.removed || this.stopped) await subscription.dispose();
        else entry.watch = { kind: "active", subscription };
      } catch {
        /* Retry missing directory or failed watcher on reconciliation. */
      }
    })().finally(() => {
      if (entry.watch.kind === "starting" && entry.watch.promise === promise)
        entry.watch = { kind: "idle" };
    });

    entry.watch = { kind: "starting", promise };
    return promise;
  }

  private refresh(entry: Entry): Promise<Usage> {
    if (entry.flight) return entry.flight;
    if (entry.removed || this.stopped)
      return Promise.resolve(emptyUsage("host-unavailable"));

    entry.flight = (async () => {
      const [value, today] = await Promise.all([
        entry.reader.read(),
        this.readToday(),
      ]);
      const next = {
        ...value,
        todayAic: today.aic,
        todayAt: today.at,
        todayReason: today.reason,
      };

      const changed =
        entry.value !== undefined && signature(entry.value) !== signature(next);
      entry.value = next;

      if (changed && !entry.removed && !this.stopped) {
        try {
          await this.context.experimental_emitSignal("changed", entry.target);
        } catch {
          /* heartbeat recovers */
        }
      }

      return next;
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
        if (Date.now() - entry.touched > SUBSCRIPTION_TTL_MS) {
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

  private async remove(entry: Entry) {
    entry.removed = true;
    if (this.entries.get(entry.target.threadId) === entry)
      this.entries.delete(entry.target.threadId);

    if (entry.watch.kind === "starting") await entry.watch.promise;
    if (entry.watch.kind === "active")
      await entry.watch.subscription.dispose().catch(() => {});
    entry.watch = { kind: "idle" };
    await entry.flight;
  }
}
