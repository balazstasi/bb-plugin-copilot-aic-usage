import { emptyUsage, type Usage } from "../src/model";
export const sessionA = "11111111-1111-4111-8111-111111111111";
export const sessionB = "22222222-2222-4222-8222-222222222222";
export const threadId = "thr_test";
export const checkpoint = (nano = 10831717000, at = new Date().toISOString()) =>
  JSON.stringify({
    type: "session.usage_checkpoint",
    timestamp: at,
    data: {
      totalNanoAiu: nano,
      totalPremiumRequests: 8,
      prompt: "PRIVATE_SENTINEL",
    },
  }) + "\n";
export const quota = () =>
  JSON.stringify({
    type: "model.model_call_success",
    timestamp: new Date().toISOString(),
    data: {
      reasoning: "PRIVATE_SENTINEL",
      quotaSnapshots: {
        premium_interactions: {
          usedRequests: 69,
          entitlementRequests: 90,
          remainingPercentage: 23,
          resetDate: "2026-10-01T00:00:00Z",
          usageAllowedWithExhaustedQuota: false,
          overageAllowedWithExhaustedQuota: true,
          secret: "PRIVATE_SENTINEL",
        },
      },
    },
  }) + "\n";
export const liveUsage = (): Usage => ({
  ...emptyUsage("ok"),
  status: "live",
  aic: "10.831717",
  premiumRequests: 8,
  checkpointAt: Date.now(),
  quotaAt: Date.now(),
  quota: {
    remainingPercentage: 23,
    resetDate: "2026-10-01T00:00:00.000Z",
    usedRequests: 69,
    entitlementRequests: 90,
    usageAllowedWithExhaustedQuota: false,
    overageAllowedWithExhaustedQuota: true,
  },
});
