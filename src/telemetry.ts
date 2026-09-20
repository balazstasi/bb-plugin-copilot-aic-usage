import type { Quota } from "./contract";

const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const bool = (v: unknown): boolean | null =>
  typeof v === "boolean" ? v : null;
function timestamp(v: unknown): number | null {
  if (typeof v !== "string" || v.length > 40 || !/^\d{4}-\d\d-\d\dT/.test(v))
    return null;
  const n = Date.parse(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Exact decimal division, including sub-credit values; unsafe JSON numbers fail closed. */
export function nanoToAic(value: unknown): string | null {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const digits = String(value);
  if (!/^\d{1,30}$/.test(digits)) return null;
  const nano = BigInt(digits);
  const fraction = (nano % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return `${nano / 1_000_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export type UsageEvent =
  | {
      kind: "checkpoint";
      aic: string;
      premiumRequests: number | null;
      at: number | null;
    }
  | { kind: "quota"; quota: Quota; at: number | null };

/** Privacy boundary: no event object, text, errors, or unknown fields leave this function. */
export function parseUsageLine(line: string): UsageEvent | null {
  if (Buffer.byteLength(line) > 256 * 1024) return null;
  try {
    const event = record(JSON.parse(line));
    if (
      event.type !== "session.usage_checkpoint" &&
      event.type !== "model.model_call_success"
    )
      return null;
    const data = record(event.data);
    const at = timestamp(event.timestamp);
    if (event.type === "session.usage_checkpoint") {
      const aic = nanoToAic(data.totalNanoAiu);
      return aic === null
        ? null
        : {
            kind: "checkpoint",
            aic,
            premiumRequests: count(data.totalPremiumRequests),
            at,
          };
    }
    const q = record(record(data.quotaSnapshots).premium_interactions);
    if (!Object.keys(q).length) return null;
    const remaining = count(q.remainingPercentage);
    const reset = timestamp(q.resetDate);
    return {
      kind: "quota",
      at,
      quota: {
        usedRequests: count(q.usedRequests),
        entitlementRequests: count(q.entitlementRequests),
        remainingPercentage:
          remaining !== null && remaining <= 100 ? remaining : null,
        resetDate: reset === null ? null : new Date(reset).toISOString(),
        usageAllowedWithExhaustedQuota: bool(q.usageAllowedWithExhaustedQuota),
        overageAllowedWithExhaustedQuota: bool(
          q.overageAllowedWithExhaustedQuota,
        ),
      },
    };
  } catch {
    return null;
  }
}

/** Bounded torn-line buffer. Oversized records are skipped through the next newline. */
export class JsonlDecoder {
  private pending = Buffer.alloc(0);
  private skipping = false;
  reset(skipFirstLine = false) {
    this.pending = Buffer.alloc(0);
    this.skipping = skipFirstLine;
  }
  push(chunk: Buffer): UsageEvent[] {
    const events: UsageEvent[] = [];
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline < 0 ? chunk.length : newline;
      const part = chunk.subarray(start, end);
      if (!this.skipping) {
        if (this.pending.length + part.length > 256 * 1024) {
          this.pending = Buffer.alloc(0);
          this.skipping = true;
        } else this.pending = Buffer.concat([this.pending, part]);
      }
      if (newline < 0) break;
      if (!this.skipping) {
        const event = parseUsageLine(this.pending.toString("utf8"));
        if (event) events.push(event);
      }
      this.pending = Buffer.alloc(0);
      this.skipping = false;
      start = newline + 1;
    }
    return events;
  }
}
