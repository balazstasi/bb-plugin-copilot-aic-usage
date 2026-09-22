import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTodayAic, startOfLocalDay } from "../src/daily";
import { parseDailyLine } from "../src/telemetry";
import { remainingRequests } from "../src/format";
import { checkpoint, sessionA, sessionB, sessionStart } from "./fixtures";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aic-daily-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const now = Date.now();
const start = startOfLocalDay(now);
const today = new Date(start + 60 * 60_000).toISOString();
const yesterday = new Date(start - 60 * 60_000).toISOString();

async function session(
  id: string,
  contents: string,
  mtime = now,
): Promise<string> {
  const directory = join(root, id);
  await mkdir(directory);
  const path = join(directory, "events.jsonl");
  await writeFile(path, contents);
  await utimes(path, new Date(mtime), new Date(mtime));
  return directory;
}

describe("host-wide today AIC", () => {
  it("sums today's checkpoints across sessions and uses midnight deltas", async () => {
    await session(sessionA, checkpoint(1_000_000_000, today));
    await session(
      sessionB,
      checkpoint(5_000_000_000, yesterday) + checkpoint(8_000_000_000, today),
    );
    expect(await readTodayAic(root, now)).toMatchObject({ aic: "4" });
  });
  it("counts a session that started today as its full cumulative total", async () => {
    await session(
      sessionA,
      sessionStart(today) + checkpoint(2_000_000_000, today),
    );
    expect(await readTodayAic(root, now)).toMatchObject({ aic: "2" });
  });
  it("does not assign pre-midnight usage to today without a baseline", async () => {
    await session(
      sessionA,
      sessionStart(yesterday) + checkpoint(9_000_000_000, today),
    );
    expect(await readTodayAic(root, now)).toMatchObject({ aic: null });
  });
  it("ignores sessions that only have yesterday checkpoints", async () => {
    await session(sessionA, checkpoint(9_000_000_000, yesterday), start - 1);
    await session(sessionB, checkpoint(1_000_000_000, today));
    expect(await readTodayAic(root, now)).toMatchObject({ aic: "1" });
  });
  it("reports unavailable when a session exceeds the reverse-read budget", async () => {
    await session(
      sessionA,
      checkpoint(5_000_000_000, today) + "x".repeat(2.5 * 1024 * 1024) + "\n",
    );
    expect(await readTodayAic(root, now)).toMatchObject({ aic: null });
  });
  it("does not consume an unterminated checkpoint", async () => {
    await session(
      sessionA,
      checkpoint(1_000_000_000, today) +
        checkpoint(9_000_000_000, today).trimEnd(),
    );
    expect(await readTodayAic(root, now)).toMatchObject({ aic: "1" });
  });
  it("reports unavailable rather than a partial sum when files exceed the limit", async () => {
    for (let i = 0; i < 65; i++) {
      await session(
        `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        checkpoint(1_000_000_000, today),
      );
    }
    expect(await readTodayAic(root, now)).toMatchObject({ aic: null });
  });
  it("refuses symlink session directories and does not leak private fields", async () => {
    const real = await session(sessionA, checkpoint(1_000_000_000, today));
    await symlink(real, join(root, sessionB));
    const result = await readTodayAic(root, now);
    expect(result).toMatchObject({ aic: "1" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(parseDailyLine(sessionStart(today).trim())).toEqual({
      kind: "start",
      at: Date.parse(today),
    });
    expect(parseDailyLine(checkpoint(1, today).trim())).toEqual({
      kind: "checkpoint",
      nano: 1n,
      at: Date.parse(today),
    });
  });
});

describe("remaining premium requests", () => {
  it("subtracts used from entitlement and fails closed", () => {
    expect(remainingRequests(69, 90)).toBe(21);
    expect(remainingRequests(90, 90)).toBe(0);
    expect(remainingRequests(100, 90)).toBe(0);
    expect(remainingRequests(null, 90)).toBeNull();
    expect(remainingRequests(69, null)).toBeNull();
  });
});
