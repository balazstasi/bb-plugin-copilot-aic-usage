import { describe, expect, it } from "vitest";
import { nanoToAic, JsonlDecoder, parseUsageLine } from "../src/telemetry";
import { sessionIdSchema, usageSchema } from "../src/model";
import { selectSession } from "../src/identity";
import { checkpoint, quota, sessionA, sessionB, liveUsage } from "./fixtures";

describe("privacy boundary and conversion", () => {
  it.each([
    [0, "0"],
    [1, "0.000000001"],
    [10831717000, "10.831717"],
    ["100000000000000000001", "100000000000.000000001"],
  ])("converts %s exactly", (value, expected) => {
    expect(nanoToAic(value)).toBe(expected);
  });
  it.each([
    -1,
    NaN,
    Infinity,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "1e9",
    "../secret",
    {},
    null,
  ])("rejects unsafe input %s", (value) => {
    expect(nanoToAic(value)).toBeNull();
  });
  it("returns only whitelisted usage fields, never private contents", () => {
    const events = [parseUsageLine(checkpoint()), parseUsageLine(quota())];
    expect(events[0]).toMatchObject({
      kind: "checkpoint",
      aic: "10.831717",
      premiumRequests: 8,
    });
    expect(events[1]).toMatchObject({
      kind: "quota",
      quota: { remainingPercentage: 23, overageAllowed: false },
    });
    expect(JSON.stringify(events)).not.toMatch(
      /PRIVATE|prompt|reasoning|secret/,
    );
    expect(
      parseUsageLine(
        '{"type":"assistant.message","data":{"text":"PRIVATE_SENTINEL"}}',
      ),
    ).toBeNull();
    expect(parseUsageLine("PRIVATE_SENTINEL malformed")).toBeNull();
    expect(
      parseUsageLine(
        '{"type":"session.usage_checkpoint","data":{"totalNanoAiu":-1}}',
      ),
    ).toBeNull();
    expect(
      usageSchema.safeParse({ ...liveUsage(), prompt: "PRIVATE" }).success,
    ).toBe(false);
  });
  it("rejects session path traversal", () => {
    for (const path of ["../secret", "/tmp/a", "uuid/../../x", "", "a\0b"])
      expect(sessionIdSchema.safeParse(path).success).toBe(false);
  });
});

describe("incremental JSONL", () => {
  it("handles every split point without partial records or duplicates", () => {
    const line = Buffer.from(checkpoint());
    for (let split = 0; split < line.length; split++) {
      const decoder = new JsonlDecoder();
      expect(decoder.push(line.subarray(0, split))).toEqual([]);
      expect(decoder.push(line.subarray(split))).toHaveLength(1);
      expect(decoder.push(Buffer.alloc(0))).toEqual([]);
    }
  });
  it("skips oversized records and malformed lines then recovers", () => {
    const decoder = new JsonlDecoder();
    for (let i = 0; i < 20; i++)
      expect(decoder.push(Buffer.alloc(64 * 1024, 65))).toEqual([]);
    expect(
      decoder.push(Buffer.from("\nnot json\n" + checkpoint())),
    ).toHaveLength(1);
  });
  it("discards a partial first tail line and resets torn data", () => {
    const decoder = new JsonlDecoder();
    decoder.reset(true);
    expect(decoder.push(Buffer.from("partial\n" + checkpoint()))).toHaveLength(
      1,
    );
    decoder.push(Buffer.from('{"type":'));
    decoder.reset();
    expect(decoder.push(Buffer.from(quota()))).toHaveLength(1);
  });
});

describe("exact identity selection", () => {
  it("selects the latest BB identity across resets, never the newest filesystem directory", () => {
    expect(
      selectSession([
        { seq: 4, data: { providerThreadId: sessionA } },
        { seq: 5, data: { providerThreadId: sessionB } },
      ]),
    ).toEqual({ sessionId: sessionB });
  });
  it("fails closed on absent, ambiguous, and invalid latest identities", () => {
    expect(selectSession([])).toEqual({ reason: "missing-identity" });
    expect(
      selectSession([
        { seq: 5, data: { providerThreadId: sessionA } },
        { seq: 5, data: { providerThreadId: sessionB } },
      ]),
    ).toEqual({ reason: "ambiguous-identity" });
    expect(
      selectSession([
        { seq: 4, data: { providerThreadId: sessionA } },
        { seq: 5, data: { providerThreadId: "../secret" } },
      ]),
    ).toEqual({ reason: "missing-identity" });
  });
});
