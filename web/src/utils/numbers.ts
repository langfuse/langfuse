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

/**
 * Specialized formatter for very small numbers (10^-3 to 10^-15 range)
 * Uses scientific notation for compact representation with ~3 significant digits
 */
export const compactSmallNumberFormatter = (
  number?: number | bigint,
  significantDigits: number = 3,
) => {
  const num = Number(number ?? 0);

  if (num === 0) return "0";

  const absNum = Math.abs(num);

  // For numbers >= 1e-3, use standard compact formatting
  if (absNum >= 1e-3) {
    return compactNumberFormatter(num, significantDigits);
  }

  // For very small numbers, use scientific notation
  return num.toExponential(significantDigits - 1);
};

export const numberFormatter = (
  number?: number | bigint,
  fractionDigits?: number,
) => {
  return Intl.NumberFormat("en-US", {
    notation: "standard",
    minimumFractionDigits: fractionDigits ?? 2,
    maximumFractionDigits: fractionDigits ?? 2,
  }).format(number ?? 0);
};

export const latencyFormatter = (milliseconds?: number) => {
  return Intl.NumberFormat("en-US", {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
    notation: "compact",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((milliseconds ?? 0) / 1000);
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

export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
