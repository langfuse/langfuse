/** A billing date as people read it: "December 26, 2026". */
export function formatBillingDate(date: Date | string | number): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** A billing period, naming the year once when both ends share it. */
export function formatBillingPeriod(start: Date, end: Date): string {
  const isSameYear = start.getFullYear() === end.getFullYear();
  const from = isSameYear
    ? start.toLocaleDateString("en-US", { month: "long", day: "numeric" })
    : formatBillingDate(start);
  return `${from} to ${formatBillingDate(end)}`;
}

/** A billing date short enough for a badge: "Dec 26". */
export function formatBillingDay(date: Date | string | number): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
