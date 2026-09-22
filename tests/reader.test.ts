import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  rm,
  writeFile,
  appendFile,
  rename,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionReader } from "../src/reader";
import { checkpoint, quota } from "./fixtures";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "aic-test-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe("bounded session reader", () => {
  it("reads usage incrementally and waits for torn writes", async () => {
    const path = join(directory, "events.jsonl");
    await writeFile(join(directory, `inuse.${process.pid}.lock`), "");
    await writeFile(path, quota() + checkpoint());
    const reader = new SessionReader(directory);
    expect(await reader.read()).toMatchObject({
      status: "live",
      aic: "10.831717",
      quota: { remainingPercentage: 23 },
    });
    const next = checkpoint(12000000001);
    await appendFile(path, next.slice(0, -1));
    expect((await reader.read()).aic).toBe("10.831717");
    await appendFile(path, "\n");
    expect((await reader.read()).aic).toBe("12.000000001");
    expect(JSON.stringify(await reader.read())).not.toContain(
      "PRIVATE_SENTINEL",
    );
  });
  it("resets on rotation, truncation, and truncate-regrow past the offset", async () => {
    const path = join(directory, "events.jsonl");
    await writeFile(path, quota() + checkpoint());
    const reader = new SessionReader(directory);
    await reader.read();
    await rename(path, join(directory, "old"));
    await writeFile(path, checkpoint(1000000000));
    expect(await reader.read()).toMatchObject({ aic: "1", quota: null });
    await writeFile(path, "");
    expect((await reader.read()).aic).toBeNull();
    await writeFile(path, checkpoint(2000000000));
    await reader.read();
    await writeFile(path, checkpoint(3000000000) + " ".repeat(1000));
    expect((await reader.read()).aic).toBe("3");
  });
  it("keeps the saved total available when returning to an idle session", async () => {
    await writeFile(
      join(directory, "events.jsonl"),
      checkpoint(1, "2020-01-01T00:00:00Z"),
    );
    const reader = new SessionReader(directory);
    expect(await reader.read()).toMatchObject({
      status: "live",
      reason: "ok",
    });
    await writeFile(join(directory, `inuse.${process.pid}.lock`), "");
    expect(await reader.read()).toMatchObject({
      status: "live",
      reason: "ok",
    });
    await rm(join(directory, "events.jsonl"));
    expect(await reader.read()).toMatchObject({
      status: "unavailable",
      aic: null,
    });
  });
  it("reads only the bounded tail of large files", async () => {
    await writeFile(
      join(directory, "events.jsonl"),
      "x".repeat(9 * 1024 * 1024) + "\n" + checkpoint(4000000000),
    );
    expect((await new SessionReader(directory).read()).aic).toBe("4");
  });
  it("refuses symlink event files and session directories", async () => {
    await writeFile(join(directory, "secret"), checkpoint());
    await symlink(join(directory, "secret"), join(directory, "events.jsonl"));
    expect((await new SessionReader(directory).read()).reason).toBe(
      "telemetry-unavailable",
    );
    await symlink(directory, join(directory, "alias"));
    expect(
      (await new SessionReader(join(directory, "alias")).read()).aic,
    ).toBeNull();
  });
});
