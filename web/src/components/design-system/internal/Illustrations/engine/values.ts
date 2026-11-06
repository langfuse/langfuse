/** Typed values: numbers keep their format while they count up, booleans read True/False, strings show as given. */

import { truncate } from "./slots";

export type ValueFormat =
  | "percent"
  | "decimal"
  | "duration"
  | "currency"
  | "count"
  | "compact";

export type Value = number | boolean | string;

export type FormattedValue = {
  text: string;
  full: string;
  /** The number to count to and how to show each step; absent for booleans and strings. */
  count?: { to: number; format: (current: number) => string };
};

const placesOf = (text: string) => (text.split(".")[1] ?? "").length;
const decimalsOf = (n: number) => Math.min(3, placesOf(String(n)));

/** Each format, set by the final value, so the steps of a count-up are never wider than where it lands. */
const formatters: Record<
  ValueFormat,
  (digits: number | undefined, final: number) => (n: number) => string
> = {
  percent: (digits) => (n) => `${(n * 100).toFixed(digits ?? 0)}%`,
  decimal: (digits, final) => (n) => n.toFixed(digits ?? decimalsOf(final)),
  duration: (digits) => (n) => `${n.toFixed(digits ?? 2)}s`,
  currency: (digits, final) => {
    if (Math.abs(final) >= 1) return (n) => `$${n.toFixed(digits ?? 2)}`;
    // Sub-dollar costs keep their significant digits (0.00064), and every step shows that many places
    const landing = String(Number(final.toPrecision(digits ?? 4)));
    return landing.includes("e")
      ? (n) => `$${n.toPrecision(digits ?? 4)}`
      : (n) => `$${n.toFixed(placesOf(landing))}`;
  },
  count: () => (n) => Math.round(n).toLocaleString("en-US"),
  compact: (digits) => (n) =>
    Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: digits ?? 1,
    }).format(n),
};

export function formatValue(
  value: Value,
  {
    format,
    digits,
    max = 10,
  }: { format?: ValueFormat; digits?: number; max?: number } = {},
): FormattedValue {
  if (typeof value === "boolean") {
    const text = value ? "True" : "False";
    return { text, full: text };
  }
  if (typeof value === "string")
    return { text: truncate(value.trim(), max), full: value.trim() };

  const formatOf = formatters[
    format ?? (Number.isInteger(value) ? "count" : "decimal")
  ](digits, value);
  const full = formatOf(value);
  return {
    text: truncate(full, max),
    full,
    count: { to: value, format: (n) => truncate(formatOf(n), max) },
  };
}
