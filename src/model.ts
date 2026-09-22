import { z } from "zod";

export const threadIdSchema = z.string().regex(/^thr_[a-zA-Z0-9_-]{1,100}$/);
// Session IDs are used as a single path component, never as an arbitrary path.
export const sessionIdSchema = z.string().uuid();

const count = z.number().finite().nonnegative();
const aic = z
  .string()
  .regex(/^\d+(\.\d{1,9})?$/)
  .nullable();

export const quotaSchema = z
  .object({
    usedRequests: count.nullable(),
    entitlementRequests: count.nullable(),
    remainingPercentage: count.max(100).nullable(),
    resetDate: z.string().datetime({ offset: true }).nullable(),
    usageAllowedWithExhaustedQuota: z.boolean().nullable(),
    overageAllowedWithExhaustedQuota: z.boolean().nullable(),
    overage: count.nullable(),
    isUnlimitedEntitlement: z.boolean().nullable(),
  })
  .strict();

export const usageSchema = z
  .object({
    supported: z.boolean(),
    status: z.enum(["live", "stale", "pending", "unavailable"]),
    reason: z.enum([
      "ok",
      "unsupported-provider",
      "missing-identity",
      "ambiguous-identity",
      "missing-host",
      "host-unavailable",
      "telemetry-unavailable",
      "awaiting-checkpoint",
      "capacity",
      "connection-lost",
    ]),
    aic,
    todayAic: aic,
    todayReason: z
      .enum([
        "directory-limit",
        "file-limit",
        "incomplete-session",
        "unreadable-session",
        "root-unavailable",
      ])
      .nullable(),
    premiumRequests: count.nullable(),
    quota: quotaSchema.nullable(),
    checkpointAt: z.number().finite().nonnegative().nullable(),
    quotaAt: z.number().finite().nonnegative().nullable(),
    todayAt: z.number().finite().nonnegative().nullable(),
    checkedAt: z.number().finite().nonnegative(),
  })
  .strict();

export type Usage = z.infer<typeof usageSchema>;
export type Quota = z.infer<typeof quotaSchema>;

export const emptyUsage = (
  reason: Usage["reason"],
  supported = true,
): Usage => ({
  supported,
  status: "unavailable",
  reason,
  aic: null,
  todayAic: null,
  todayReason: null,
  premiumRequests: null,
  quota: null,
  checkpointAt: null,
  quotaAt: null,
  todayAt: null,
  checkedAt: Date.now(),
});

export const targetSchema = z
  .object({ threadId: threadIdSchema, sessionId: sessionIdSchema })
  .strict();
export type Target = z.infer<typeof targetSchema>;

export const realtimeSchema = z.object({ threadId: threadIdSchema }).strict();
export const USAGE_CHANGED = "usage-changed";
