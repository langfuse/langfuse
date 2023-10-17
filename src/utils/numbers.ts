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

export const usdFormatter = (number: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",

    // These options are needed to round to whole numbers if that's what you want.
    //minimumFractionDigits: 0, // (this suffices for whole numbers, but will print 2500.10 as $2,500.1)
    //maximumFractionDigits: 0, // (causes 2500.99 to be printed as $2,501)
  }).format(number);
