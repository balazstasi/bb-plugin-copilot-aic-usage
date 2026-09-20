import { constants } from "node:fs";
import { open, lstat, opendir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { emptyUsage, type Usage } from "./contract";
import { JsonlDecoder, type UsageEvent } from "./telemetry";

const READ_BUDGET = 8 * 1024 * 1024;
async function fingerprint(
  file: Awaited<ReturnType<typeof open>>,
  offset: number,
) {
  const length = Math.min(4096, offset);
  const head = Buffer.alloc(length),
    tail = Buffer.alloc(length);
  await file.read(head, 0, length, 0);
  await file.read(tail, 0, length, offset - length);
  return createHash("sha256").update(head).update(tail).digest("hex");
}

export class SessionReader {
  private decoder = new JsonlDecoder();
  private offset = 0;
  private inode = "";
  private anchor = "";
  private usage = emptyUsage("awaiting-checkpoint");
  constructor(readonly directory: string) {}
  private reset(skipFirstLine = false) {
    this.decoder.reset(skipFirstLine);
    this.usage = emptyUsage("awaiting-checkpoint");
  }
  private apply(event: UsageEvent) {
    if (event.kind === "checkpoint") {
      this.usage.aic = event.aic;
      this.usage.premiumRequests = event.premiumRequests;
      this.usage.checkpointAt = event.at;
    } else {
      this.usage.quota = event.quota;
      this.usage.quotaAt = event.at;
    }
  }
  async read(now = Date.now()): Promise<Usage> {
    try {
      // Refuse symlink session directories and event files; never follow arbitrary paths.
      if (!(await lstat(this.directory)).isDirectory())
        throw new Error("directory");
      const file = await open(
        join(this.directory, "events.jsonl"),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const stat = await file.stat();
        if (!stat.isFile()) throw new Error("file");
        const inode = `${stat.dev}:${stat.ino}`;
        let replaced = inode !== this.inode || stat.size < this.offset;
        if (!replaced && this.offset > 0) {
          replaced = (await fingerprint(file, this.offset)) !== this.anchor;
        }
        if (replaced) {
          this.offset = 0;
          this.reset();
        }
        this.inode = inode;
        if (stat.size - this.offset > READ_BUDGET) {
          this.offset = stat.size - READ_BUDGET;
          this.reset(true); // Cumulative checkpoints make a bounded tail sufficient.
        }
        const buffer = Buffer.alloc(64 * 1024);
        const end = stat.size;
        while (this.offset < end) {
          const { bytesRead } = await file.read(
            buffer,
            0,
            Math.min(buffer.length, end - this.offset),
            this.offset,
          );
          if (!bytesRead) break;
          for (const event of this.decoder.push(buffer.subarray(0, bytesRead)))
            this.apply(event);
          this.offset += bytesRead;
        }
        this.anchor = await fingerprint(file, this.offset);
      } finally {
        await file.close();
      }
      let active = false;
      // Locks only inform freshness, never session selection.
      let scanned = 0;
      for await (const entry of await opendir(this.directory)) {
        if (++scanned > 1024) break;
        const match = /^inuse\.(\d{1,10})\.lock$/.exec(entry.name);
        if (!match || Number(match[1]) <= 0) continue;
        try {
          process.kill(Number(match[1]), 0);
          active = true;
        } catch {
          /* exited or inaccessible */
        }
      }
      const old =
        this.usage.checkpointAt === null ||
        now - this.usage.checkpointAt > 5 * 60_000;
      return {
        ...this.usage,
        checkedAt: now,
        status:
          this.usage.aic === null
            ? "pending"
            : !active || old
              ? "stale"
              : "live",
        reason:
          this.usage.aic === null
            ? "awaiting-checkpoint"
            : !active
              ? "inactive-session"
              : old
                ? "no-recent-checkpoint"
                : "ok",
      };
    } catch {
      this.offset = 0;
      this.inode = "";
      this.anchor = "";
      this.reset();
      return { ...emptyUsage("telemetry-unavailable"), checkedAt: now };
    }
  }
}
