import { constants } from "node:fs";
import { open, lstat, opendir } from "node:fs/promises";
import { join } from "node:path";
import { sessionIdSchema } from "./contract";
import { nanoToAic, parseDailyLine } from "./telemetry";

const CHUNK = 64 * 1024;
const READ_BUDGET = 2 * 1024 * 1024;
const MAX_DIRS = 1024;
const MAX_FILES = 64;
const unavailable = (reason: DailyReason) => ({ aic: null, at: null, reason });
const isMissing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT";
type DailyReason =
  | "directory-limit"
  | "file-limit"
  | "incomplete-session"
  | "unreadable-session"
  | "root-unavailable";
type DailyScan = {
  latest: { nano: bigint; at: number } | null;
  baseline: bigint | null;
  startedAt: number | null;
};

export function startOfLocalDay(now: number): number {
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

async function sessionTodayNano(
  directory: string,
  startOfDay: number,
): Promise<{ nano: bigint; at: number | null } | null> {
  const dir = await lstat(directory);
  if (dir.isSymbolicLink() || !dir.isDirectory()) return null;
  const file = await open(
    join(directory, "events.jsonl"),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size === 0) return { nano: 0n, at: null };
    let position = stat.size;
    let buffer = "";
    const found: DailyScan = {
      latest: null,
      baseline: null,
      startedAt: null,
    };
    let read = 0;
    let skipTail = true;
    const done = () =>
      found.baseline !== null ||
      (found.startedAt !== null && found.latest !== null);
    while (position > 0 && !done() && read < READ_BUDGET) {
      const size = Math.min(CHUNK, position, READ_BUDGET - read);
      position -= size;
      read += size;
      const chunk = Buffer.alloc(size);
      const { bytesRead } = await file.read(chunk, 0, size, position);
      if (bytesRead !== size) return null;
      buffer = chunk.toString("utf8") + buffer;
      let newline = buffer.lastIndexOf("\n");
      while (newline !== -1 && !done()) {
        const line = buffer.slice(newline + 1);
        buffer = buffer.slice(0, newline);
        // A final record is committed only once its newline is present.
        if (!skipTail) applyDailyLine(line, startOfDay, found);
        skipTail = false;
        newline = buffer.lastIndexOf("\n");
      }
    }
    if (!skipTail && found.baseline === null && position === 0 && buffer)
      applyDailyLine(buffer, startOfDay, found);
    const reachedStart = position === 0;
    const latest = found.latest;
    if (!latest)
      return reachedStart || found.baseline !== null
        ? { nano: 0n, at: null }
        : null;
    if (found.baseline !== null)
      return {
        nano: latest.nano > found.baseline ? latest.nano - found.baseline : 0n,
        at: latest.at,
      };
    if (found.startedAt !== null && found.startedAt < startOfDay) return null;
    if (found.startedAt !== null || reachedStart)
      return { nano: latest.nano, at: latest.at };
    return null;
  } finally {
    await file.close();
  }
}

function applyDailyLine(line: string, startOfDay: number, found: DailyScan) {
  if (!line) return;
  const event = parseDailyLine(line);
  if (!event || event.at === null) return;
  if (event.kind === "start") {
    found.startedAt = event.at;
    return;
  }
  if (event.at >= startOfDay) {
    if (!found.latest) found.latest = { nano: event.nano, at: event.at };
    return;
  }
  found.baseline = event.nano;
}

export async function readTodayAic(
  root: string,
  now = Date.now(),
): Promise<{
  aic: string | null;
  at: number | null;
  reason: DailyReason | null;
}> {
  const startOfDay = startOfLocalDay(now);
  let total = 0n;
  let latestAt: number | null = null;
  let dirs = 0;
  let files = 0;
  try {
    for await (const entry of await opendir(root)) {
      if (++dirs > MAX_DIRS) return unavailable("directory-limit");
      if (!sessionIdSchema.safeParse(entry.name).success) continue;
      const directory = join(root, entry.name);
      try {
        const dir = await lstat(directory);
        if (dir.isSymbolicLink() || !dir.isDirectory()) continue;
        const events = await lstat(join(directory, "events.jsonl"));
        if (!events.isFile() || events.mtimeMs < startOfDay) continue;
        if (++files > MAX_FILES) return unavailable("file-limit");
        const contrib = await sessionTodayNano(directory, startOfDay);
        if (!contrib) return unavailable("incomplete-session");
        total += contrib.nano;
        if (contrib.at !== null && (latestAt === null || contrib.at > latestAt))
          latestAt = contrib.at;
      } catch (error) {
        if (isMissing(error)) continue;
        return unavailable("unreadable-session");
      }
    }
  } catch {
    return unavailable("root-unavailable");
  }
  return { aic: nanoToAic(total.toString()), at: latestAt, reason: null };
}
