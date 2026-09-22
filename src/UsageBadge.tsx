import { useId, useState } from "react";
import type { Usage } from "./model";
import { formatAic, remainingRequests } from "./format";

const reasons: Record<Usage["reason"], string> = {
  ok: "Live local checkpoint",
  "unsupported-provider": "Not a Copilot ACP thread",
  "missing-identity": "Waiting for an exact Copilot session identity",
  "ambiguous-identity": "Session identity is ambiguous; no usage selected",
  "missing-host": "Thread host is not available",
  "host-unavailable": "Cannot reach the Copilot host",
  "telemetry-unavailable": "Session telemetry is missing or unreadable",
  "awaiting-checkpoint": "Waiting for the first usage checkpoint",
  "inactive-session": "Stale: session has no live process lock",
  "no-recent-checkpoint":
    "Stale: no checkpoint in five minutes; session may be idle",
  capacity: "Usage watcher capacity reached",
  "connection-lost": "Stale: reconnecting to BB",
};
export function UsageBadge({
  usage,
  compact = false,
}: {
  usage: Usage;
  compact?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!usage.supported) return null;
  const value = formatAic(usage.aic);
  const today = formatAic(usage.todayAic);
  const remaining = remainingRequests(
    usage.quota?.usedRequests,
    usage.quota?.entitlementRequests,
  );
  const summary = `${value} AIC${usage.status === "stale" ? " · stale" : ""}`;
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Copilot session: ${summary}. Hover for today and monthly quota. ${reasons[usage.reason]}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={`cursor-help rounded-md px-2 py-1 text-xs tabular-nums underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${usage.status === "live" ? "text-foreground" : "text-muted-foreground"}`}
      >
        {compact ? (
          <span className="inline-flex flex-col leading-tight">
            <span>{value}</span>
            <span>AIC</span>
          </span>
        ) : (
          summary
        )}
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          <p className="font-medium">Copilot AI credits</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <dt>This session</dt>
            <dd className="text-right tabular-nums">{value} AIC</dd>
            <dt>Premium requests this session</dt>
            <dd className="text-right">
              {usage.premiumRequests ?? "Unavailable"}
            </dd>
          </dl>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-2">
            <dt>Used today on this host</dt>
            <dd className="text-right tabular-nums">{today} AIC</dd>
          </dl>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-border pt-2">
            <dt>Premium used this month</dt>
            <dd className="text-right tabular-nums">
              {usage.quota?.usedRequests == null
                ? "Unavailable"
                : `${usage.quota.usedRequests} / ${usage.quota.entitlementRequests ?? "—"}`}
            </dd>
            <dt>Premium remaining</dt>
            <dd className="text-right tabular-nums">
              {usage.quota?.isUnlimitedEntitlement
                ? "Unlimited"
                : remaining == null && usage.quota?.remainingPercentage == null
                  ? "Unavailable"
                  : [
                      remaining != null ? String(remaining) : null,
                      usage.quota?.remainingPercentage != null
                        ? `${usage.quota.remainingPercentage}%`
                        : null,
                    ]
                      .filter((part): part is string => part != null)
                      .join(" · ")}
            </dd>
            <dt>Monthly reset (UTC)</dt>
            <dd className="text-right">
              {usage.quota?.resetDate
                ?.replace("T", " ")
                .replace(".000Z", " UTC") ?? "Unavailable"}
            </dd>
            {usage.quota?.overage != null && usage.quota.overage > 0 && (
              <>
                <dt>Overage</dt>
                <dd className="text-right tabular-nums">
                  {usage.quota.overage}
                </dd>
              </>
            )}
            {usage.quota?.usageAllowedWithExhaustedQuota != null && (
              <>
                <dt>Usage after quota</dt>
                <dd className="text-right">
                  {usage.quota.usageAllowedWithExhaustedQuota ? "Yes" : "No"}
                </dd>
              </>
            )}
            {usage.quota?.overageAllowedWithExhaustedQuota != null && (
              <>
                <dt>Overage after quota</dt>
                <dd className="text-right">
                  {usage.quota.overageAllowedWithExhaustedQuota ? "Yes" : "No"}
                </dd>
              </>
            )}
          </dl>
          <p className="mt-2 text-muted-foreground">{reasons[usage.reason]}</p>
          {usage.checkpointAt !== null && (
            <p className="mt-1 text-muted-foreground">
              Checkpoint: {new Date(usage.checkpointAt).toLocaleString()}
            </p>
          )}
          {usage.quotaAt !== null && (
            <p className="mt-1 text-muted-foreground">
              Monthly snapshot: {new Date(usage.quotaAt).toLocaleString()}
            </p>
          )}
          <p className="mt-2 text-muted-foreground">
            Session and today figures are local AIC from Copilot sessions on
            this host, not a billing invoice. Copilot does not publish remaining
            AIC; monthly remaining is premium requests and may lag.
          </p>
        </div>
      )}
    </div>
  );
}
