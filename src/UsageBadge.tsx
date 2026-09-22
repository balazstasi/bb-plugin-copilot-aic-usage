import { useId, useState } from "react";
import type { Usage } from "./model";
import { formatAic } from "./format";

const reasons: Record<Usage["reason"], string> = {
  ok: "Saved local checkpoint",
  "unsupported-provider": "Not a Copilot ACP thread",
  "missing-identity": "Waiting for an exact Copilot session identity",
  "ambiguous-identity": "Session identity is ambiguous; no usage selected",
  "missing-host": "Thread host is not available",
  "host-unavailable": "Cannot reach the Copilot host",
  "telemetry-unavailable": "Session telemetry is missing or unreadable",
  "awaiting-checkpoint": "Waiting for the first usage checkpoint",
  capacity: "Usage watcher capacity reached",
  "connection-lost": "Stale: reconnecting to BB",
};
const todayReasons: Record<NonNullable<Usage["todayReason"]>, string> = {
  "directory-limit": "Today's total is unavailable: too many session folders",
  "file-limit": "Today's total is unavailable: too many session files",
  "incomplete-session":
    "Today's total is unavailable: a session scan is incomplete",
  "unreadable-session":
    "Today's total is unavailable: a session file cannot be read",
  "root-unavailable":
    "Today's total is unavailable: Copilot session storage cannot be read",
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
  const used = usage.quota?.usedRequests;
  const entitlement = usage.quota?.entitlementRequests;
  let premium = "Unavailable";
  if (used != null) {
    if (usage.quota?.isUnlimitedEntitlement) premium = `${used} / Unlimited`;
    else if (entitlement == null) premium = `${used} used`;
    else
      premium = `${used} / ${entitlement}${entitlement > 0 ? ` (${Math.round((used / entitlement) * 100)}%)` : ""}`;
  }
  const summary = `${value} AIC${usage.status === "stale" ? " · stale" : ""}`;
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`Copilot session: ${summary}. Open usage details. ${reasons[usage.reason]}`}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
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
        <div className="absolute right-0 top-full z-50 w-80 pt-1">
          <div
            id={id}
            role="dialog"
            aria-label="Copilot AI credits"
            className="rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
          >
            <p className="text-sm font-medium">Copilot AI credits</p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2">
              <dt>This session</dt>
              <dd className="text-right tabular-nums">{value} AIC</dd>
              <dt>Used today on this host</dt>
              <dd className="text-right tabular-nums">{today} AIC</dd>
            </dl>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 border-t border-border pt-3">
              <dt>Premium used this month</dt>
              <dd className="text-right tabular-nums">{premium}</dd>
              <dt>Monthly reset (UTC)</dt>
              <dd className="text-right tabular-nums">
                {usage.quota?.resetDate?.slice(0, 10) ?? "Unavailable"}
              </dd>
            </dl>
            <details className="mt-3 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
              <summary className="cursor-pointer select-none">Details</summary>
              <div className="mt-2 space-y-1">
                <p>{reasons[usage.reason]}</p>
                {usage.todayReason && <p>{todayReasons[usage.todayReason]}</p>}
                {usage.checkpointAt !== null && (
                  <p>
                    Checkpoint: {new Date(usage.checkpointAt).toLocaleString()}
                  </p>
                )}
                {usage.quotaAt !== null && (
                  <p>
                    Monthly snapshot: {new Date(usage.quotaAt).toLocaleString()}
                  </p>
                )}
                <p>
                  Session and today figures are local AIC from Copilot sessions
                  on this host, not a billing invoice. Copilot does not publish
                  remaining AIC; monthly quota may lag.
                </p>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}
