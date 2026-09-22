import { sessionIdSchema } from "./contract";

type Identity = { seq: number; data: { providerThreadId: string } };

/** Latest identity wins on resume/fork/reset. Never fall back to an older valid ID. */
export function selectSession(
  rows: readonly Identity[],
):
  | { sessionId: string }
  | { reason: "missing-identity" | "ambiguous-identity" } {
  if (!rows.length) return { reason: "missing-identity" };

  const latest = Math.max(...rows.map((r) => r.seq));
  const ids = new Set(
    rows.filter((r) => r.seq === latest).map((r) => r.data.providerThreadId),
  );

  if (ids.size !== 1) return { reason: "ambiguous-identity" };

  const parsed = sessionIdSchema.safeParse([...ids][0]);
  return parsed.success
    ? { sessionId: parsed.data }
    : { reason: "missing-identity" };
}
