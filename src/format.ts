export function formatAic(value: string | null): string {
  if (value === null) return "—";
  const [whole, fraction] = value.split(".");
  return fraction && fraction[0] >= "5"
    ? (BigInt(whole) + 1n).toString()
    : whole;
}
