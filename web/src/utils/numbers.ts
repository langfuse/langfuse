export const compactNumberFormatter = (number?: number) => {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 2,
  }).format(number ?? 0);
};

export const numberFormatter = (number?: number, fractionDigits?: number) => {
  return Intl.NumberFormat("en-US", {
    notation: "standard",
    minimumFractionDigits: fractionDigits ?? 2,
    maximumFractionDigits: fractionDigits ?? 2,
  }).format(number ?? 0);
};

export const latencyFormatter = (number?: number, fractionDigits?: number) => {
  return Intl.NumberFormat("en-US", {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
    notation: "compact",
    minimumFractionDigits: fractionDigits ?? 2,
    maximumFractionDigits: fractionDigits ?? 2,
  }).format(number ?? 0);
};

export const usdFormatter = (
  number: number,
  minimumFractionDigits: number = 2,
  maximumFractionDigits: number = 4,
) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#minimumfractiondigits
    minimumFractionDigits,
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat#maximumfractiondigits
    maximumFractionDigits,
  }).format(number ?? 0);
};

export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
