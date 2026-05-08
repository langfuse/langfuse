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

const durationFormatters = [
  "millisecond",
  "second",
  "minute",
  "hour",
  "day",
].map((unit) =>
  Intl.NumberFormat("en-US", {
    style: "unit",
    unit: unit,
    unitDisplay: "narrow",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }),
);

const selectDurationFormatter = (
  milliseconds: number | bigint,
): [Intl.NumberFormat, number] => {
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
  minimumFractionDigits: number = 2,
  maximumFractionDigits: number = 6,
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

export const costFormatter = (totalCost?: number) => {
  return totalCost
    ? totalCost < 5
      ? usdFormatter(totalCost, 2, 6)
      : usdFormatter(totalCost, 2, 2)
    : usdFormatter(0);
};

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

export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
