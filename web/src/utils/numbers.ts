/* eslint-disable @typescript-eslint/no-use-before-define */
import Decimal from "decimal.js";

export const compactNumberFormatter = (
  number?: number | bigint,
  maxFractionDigits?: number,
) => {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: maxFractionDigits ?? 2,
  }).format(number ?? 0);
};

export const numberFormatter = (
  number?: number | bigint,
  fractionDigits?: number,
  maxFractionDigits?: number,
) => {
  return Intl.NumberFormat("en-US", {
    notation: "standard",
    useGrouping: true,
    minimumFractionDigits: fractionDigits ?? 2,
    maximumFractionDigits: maxFractionDigits ?? fractionDigits ?? 2,
  }).format(number ?? 0);
};

const durationDivisors = [1, 1_000, 60_000, 3_600_000, 86_400_000] as const;

const durationUnits = [
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
] as const;

const durationSuffixes = ["ms", "s", "m", "h", "d"] as const;

type DurationFormatter = { format: (value: number) => string };

/**
 * Some browsers reject `style: "unit"` (`RangeError` on the style option).
 * This module is imported from the events barrel into the `_app` layout graph,
 * so a throw during construction fails the whole app evaluation.
 */
const createDurationFormatter = (
  unit: (typeof durationUnits)[number],
  suffix: (typeof durationSuffixes)[number],
): DurationFormatter => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "unit",
      unit,
      unitDisplay: "narrow",
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    return {
      format: (value) =>
        `${new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(value)}${suffix}`,
    };
  }
};

const durationFormatters = durationUnits.map((unit, index) =>
  createDurationFormatter(unit, durationSuffixes[index]!),
);

const selectDurationFormatter = (
  milliseconds: number | bigint,
): [DurationFormatter, number] => {
  const ms = Number(milliseconds);
  const tier = durationDivisors.reduce(
    (acc, divisor, i) => (Math.abs(ms) >= divisor ? i : acc),
    0,
  );
  return [durationFormatters[tier], ms / durationDivisors[tier]!];
};

export const latencyFormatter = (milliseconds?: number): string => {
  const [fmt, value] = selectDurationFormatter(milliseconds ?? 0);
  return fmt.format(value ?? 0);
};

export const usdFormatter = (
  number?: number | bigint | Decimal,
  minimumFractionDigits = 2,
  maximumFractionDigits = 6,
) => {
  const numberToFormat = number instanceof Decimal ? number.toNumber() : number;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#minimumfractiondigits
    minimumFractionDigits,
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#maximumfractiondigits
    maximumFractionDigits,
  }).format(numberToFormat ?? 0);
};

/** Below this, two fraction digits would render a real cost as "$0.00". */
const SUB_CENT_THRESHOLD = 0.01;
/** Upper bound on the widening, so a dust value cannot stretch a table cell. */
const MAX_SUB_CENT_FRACTION_DIGITS = 10;

export const costFormatter = (totalCost?: number) => {
  const cost = totalCost ?? 0;

  if (
    typeof cost === "number" &&
    cost !== 0 &&
    Math.abs(cost) < SUB_CENT_THRESHOLD
  ) {
    return usdFormatter(cost, 2, subCentFractionDigits(cost));
  }

  return usdFormatter(cost, 2, 2);
};

/** Cent precision; a non-zero cost that would round to $0.00 reads "<$0.01". */
export const centCostFormatter = (cost: number) => {
  if (cost !== 0 && Math.abs(cost) < SUB_CENT_THRESHOLD / 2) {
    return `${cost < 0 ? "-" : ""}<${usdFormatter(SUB_CENT_THRESHOLD, 2, 2)}`;
  }

  return usdFormatter(cost, 2, 2);
};

/** Returns the fraction digits that render a sub-cent cost to ~3 significant digits. */
const subCentFractionDigits = (cost: number) =>
  Math.min(
    2 + Math.ceil(-Math.log10(Math.abs(cost))),
    MAX_SUB_CENT_FRACTION_DIGITS,
  );

export const formatTokenCounts = (
  inputUsage?: number | null,
  outputUsage?: number | null,
  totalUsage?: number | null,
  showLabels = false,
): string => {
  if (!inputUsage && !outputUsage && !totalUsage) return "";

  return showLabels
    ? `${numberFormatter(inputUsage ?? 0, 0)} prompt → ${numberFormatter(outputUsage ?? 0, 0)} completion (∑ ${numberFormatter(totalUsage ?? 0, 0)})`
    : `${numberFormatter(inputUsage ?? 0, 0)} → ${numberFormatter(outputUsage ?? 0, 0)} (∑ ${numberFormatter(totalUsage ?? 0, 0)})`;
};
