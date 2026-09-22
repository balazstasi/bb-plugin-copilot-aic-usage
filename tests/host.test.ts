import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { watch } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import type { ExperimentalHostWatchListener } from "@get-bb/plugin-sdk";
import { createUsageHostEntry } from "../host";
import { checkpoint, sessionA, sessionB, threadId } from "./fixtures";

let root: string;
const disposers: (() => Promise<void>)[] = [];
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aic-host-"));
});
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});
async function setup() {
  const watches = new Map<string, ExperimentalHostWatchListener>();
  const disposed: string[] = [];
  for (const session of [sessionA, sessionB]) {
    await mkdir(join(root, session));
    await writeFile(
      join(root, session, "events.jsonl"),
      checkpoint(session === sessionA ? 1000000000 : 2000000000),
    );
  }
  const harness = experimental_createHostEntryHarness(
    createUsageHostEntry(root),
    {
      experimental_watch: async (options, listener) => {
        watches.set(options.rootPath, listener);
        return {
          dispose: async () => {
            disposed.push(options.rootPath);
            watches.delete(options.rootPath);
          },
        };
      },
    },
  );
  disposers.push(() => harness.experimental_dispose());
  return { harness, watches, disposed };
}
describe("host RPC, watch lifecycle and concurrent sessions", () => {
  it("updates on file notification with only an invalidation signal", async () => {
    const { harness, watches } = await setup();
    expect(
      await harness.experimental_call("read", {
        threadId,
        sessionId: sessionA,
      }),
    ).toMatchObject({ aic: "1", todayAic: "3" });
    await appendFile(
      join(root, sessionA, "events.jsonl"),
      checkpoint(3000000000),
    );
    await watches.get(join(root, sessionA))!({ kind: "rescan-required" });
    expect(harness.experimental_getSignals()).toEqual([
      { signal: "changed", payload: { threadId, sessionId: sessionA } },
    ]);
    expect(
      await harness.experimental_call("read", {
        threadId,
        sessionId: sessionA,
      }),
    ).toMatchObject({ aic: "3" });
    expect(JSON.stringify(harness.experimental_getSignals())).not.toContain(
      "PRIVATE",
    );
  });
  it("refreshes the shared daily total after a watched append", async () => {
    const { harness, watches } = await setup();
    await harness.experimental_call("read", { threadId, sessionId: sessionA });
    await appendFile(
      join(root, sessionA, "events.jsonl"),
      checkpoint(4_000_000_000),
    );
    await watches.get(join(root, sessionA))!({ kind: "rescan-required" });
    expect(
      await harness.experimental_call("read", {
        threadId,
        sessionId: sessionA,
      }),
    ).toMatchObject({ aic: "4", todayAic: "6" });
  });
  it("isolates multiple threads and replaces the watch when session identity changes", async () => {
    const { harness, watches, disposed } = await setup();
    const values = await Promise.all([
      harness.experimental_call("read", { threadId, sessionId: sessionA }),
      harness.experimental_call("read", {
        threadId: "thr_other",
        sessionId: sessionB,
      }),
    ]);
    expect(values.map((value) => value.aic)).toEqual(["1", "2"]);
    expect(watches.size).toBe(2);
    expect(
      (
        await harness.experimental_call("read", {
          threadId,
          sessionId: sessionB,
        })
      ).aic,
    ).toBe("2");
    expect(disposed).toContain(join(root, sessionA));
    await harness.experimental_dispose();
    expect(watches.size).toBe(0);
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
  });
  it("expires idle subscriptions and releases the worker lease", async () => {
    const { harness, watches } = await setup();
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    await harness.experimental_call("read", { threadId, sessionId: sessionA });
    vi.setSystemTime(Date.now() + 100000);
    await vi.advanceTimersByTimeAsync(15000);
    expect(watches.size).toBe(0);
    expect(harness.experimental_getRetainedWorkerLeaseCount()).toBe(0);
  });
  it("rejects arbitrary filesystem paths at the host RPC boundary", async () => {
    const { harness, watches } = await setup();
    await expect(
      harness.experimental_call("read", { threadId, sessionId: "../secret" }),
    ).rejects.toThrow();
    expect(watches.size).toBe(0);
  });
  it("serializes rapid identity changes without leaking watchers", async () => {
    const { harness, disposed } = await setup();
    const values = await Promise.all(
      [sessionA, sessionB, sessionA].map((sessionId) =>
        harness.experimental_call("read", { threadId, sessionId }),
      ),
    );
    expect(values.map((value) => value.aic)).toEqual(["1", "2", "1"]);
    expect(disposed).toHaveLength(2);
  });
  it("recovers missed notifications by reconciliation when watching fails", async () => {
    await mkdir(join(root, sessionA));
    await writeFile(
      join(root, sessionA, "events.jsonl"),
      checkpoint(1000000000),
    );
    const harness = experimental_createHostEntryHarness(
      createUsageHostEntry(root),
      {
        experimental_watch: async () => {
          throw new Error("unavailable");
        },
      },
    );
    disposers.push(() => harness.experimental_dispose());
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    await harness.experimental_call("read", { threadId, sessionId: sessionA });
    await appendFile(
      join(root, sessionA, "events.jsonl"),
      checkpoint(3000000000),
    );
    await vi.advanceTimersByTimeAsync(15000);
    // Flush real filesystem work kicked off by the timer.
    await vi.waitFor(() =>
      expect(harness.experimental_getSignals()).toHaveLength(1),
    );
    expect(
      (
        await harness.experimental_call("read", {
          threadId,
          sessionId: sessionA,
        })
      ).aic,
    ).toBe("3");
  });
  it("observes a real filesystem append through the host signal contract", async () => {
    await mkdir(join(root, sessionA));
    const path = join(root, sessionA, "events.jsonl");
    await writeFile(path, checkpoint(1000000000));
    const harness = experimental_createHostEntryHarness(
      createUsageHostEntry(root),
      {
        experimental_watch: async (options, listener) => {
          const watcher = watch(options.rootPath, () => {
            void listener({ kind: "rescan-required" });
          });
          return {
            dispose: async () => {
              watcher.close();
            },
          };
        },
      },
    );
    disposers.push(() => harness.experimental_dispose());
    await harness.experimental_call("read", { threadId, sessionId: sessionA });
    await appendFile(path, checkpoint(5000000000));
    await vi.waitFor(() =>
      expect(harness.experimental_getSignals().length).toBeGreaterThan(0),
    );
    expect(
      (
        await harness.experimental_call("read", {
          threadId,
          sessionId: sessionA,
        })
      ).aic,
    ).toBe("5");
  });
});
