import { useId, useState } from "react";
import type { Usage } from "./model";

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
  const value = usage.aic ?? "—";
  const summary = `${value} AIC${usage.status === "stale" ? " · stale" : ""}`;
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Copilot session: ${summary}. ${reasons[usage.reason]}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={`rounded-md px-2 py-1 text-xs tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${usage.status === "live" ? "text-foreground" : "text-muted-foreground"}`}
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
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"
        >
          <p className="font-medium">Copilot session AI credits</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            <dt>Current session AIC / AIU</dt>
            <dd className="text-right tabular-nums">{value}</dd>
            <dt>Premium requests</dt>
            <dd className="text-right">
              {usage.premiumRequests ?? "Unavailable"}
            </dd>
            <dt>Monthly remaining</dt>
            <dd className="text-right">
              {usage.quota?.remainingPercentage == null
                ? "Unavailable"
                : `${usage.quota.remainingPercentage}%`}
            </dd>
            <dt>Monthly reset (UTC)</dt>
            <dd className="text-right">
              {usage.quota?.resetDate
                ?.replace("T", " ")
                .replace(".000Z", " UTC") ?? "Unavailable"}
            </dd>
            {usage.quota?.usedRequests != null && (
              <>
                <dt>Monthly used</dt>
                <dd className="text-right">
                  {usage.quota.usedRequests} /{" "}
                  {usage.quota.entitlementRequests ?? "—"}
                </dd>
              </>
            )}
            {usage.quota?.overageAllowed != null && (
              <>
                <dt>Overage allowed</dt>
                <dd className="text-right">
                  {usage.quota.overageAllowed ? "Yes" : "No"}
                </dd>
              </>
            )}
            {usage.quota?.overagePermitted != null && (
              <>
                <dt>Overage permitted</dt>
                <dd className="text-right">
                  {usage.quota.overagePermitted ? "Yes" : "No"}
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
            Local cumulative usage, separate from context tokens. Monthly quota
            may lag.
          </p>
        </div>
      )}
    </div>
  );
}
