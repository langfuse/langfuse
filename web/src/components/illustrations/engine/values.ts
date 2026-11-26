/** Typed values: numbers keep their format while they count up, booleans read True/False, strings show as given. */

import { asWritten, truncate } from "./slots";

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
    const significant = Math.max(1, digits ?? 4);
    const landing = String(Number(final.toPrecision(significant)));
    return landing.includes("e")
      ? (n) => `$${n.toPrecision(significant)}`
      : (n) => `$${n.toFixed(placesOf(landing))}`;
  },
  count: () => (n) => Math.round(n).toLocaleString("en-US"),
  compact: (digits) => (n) =>
    Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: digits ?? 1,
    }).format(n),
};

/** `digits` as every formatter takes it: a whole number from 0 to 20, or absent for the format's own. */
const usableDigits = (digits: number | undefined) =>
  digits === undefined || !Number.isFinite(digits)
    ? undefined
    : Math.min(20, Math.max(0, Math.round(digits)));

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
  if (typeof value === "string") return asWritten(value, max);

  const formatOf = formatters[
    format ?? (Number.isInteger(value) ? "count" : "decimal")
  ](usableDigits(digits), value);
  const full = formatOf(value);
  return {
    text: truncate(full, max),
    full,
    count: { to: value, format: (n) => truncate(formatOf(n), max) },
  };
}
