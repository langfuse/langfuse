export const compactNumberFormatter = (number: number) => {
  return Intl.NumberFormat("us", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 2,
  }).format(number);
};

export const numberFormatter = (number: number) => {
  return Intl.NumberFormat("us", {
    notation: "standard",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
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
  }).format(number);
};

export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
