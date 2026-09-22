export function formatAic(value: string | null): string {
  if (value === null) return "—";
  const [whole, fraction] = value.split(".");
  return fraction && fraction[0] >= "5"
    ? (BigInt(whole) + 1n).toString()
    : whole;
}

export function remainingRequests(
  used: number | null | undefined,
  entitlement: number | null | undefined,
): number | null {
  if (used == null || entitlement == null) return null;
  return Math.max(0, entitlement - used);
}
