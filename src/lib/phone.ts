/** One canonical form (08…) so +62 / 62 / 08 spellings of the same number compare equal. */
export function normPhone(v: unknown): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("62")) return "0" + d.slice(2);
  if (d.startsWith("8")) return "0" + d;
  return d;
}
