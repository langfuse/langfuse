import Decimal from "decimal.js";

export interface Details {
  [key: string]: number | undefined;
}

/**
 * Aggregates usage or cost details by summing values based on key patterns.
 * Used to calculate input/output/total values from detailed breakdowns.
 */
export const calculateAggregatedUsage = (
  details: Details | Details[],
): {
  input: number;
  output: number;
  total: number;
} => {
  const aggregatedDetails = Array.isArray(details)
    ? details.reduce<Details>((acc, curr) => {
        Object.entries(curr).forEach(([key, value]) => {
          acc[key] = new Decimal(acc[key] || 0)
            .plus(new Decimal(value || 0))
            .toNumber();
        });
        return acc;
      }, {})
    : details;

  // Sum all keys containing "input"
  const input = Object.entries(aggregatedDetails)
    .filter(([key]) => key.includes("input"))
    .reduce(
      (sum, [_, value]) =>
        new Decimal(sum).plus(new Decimal(value ?? 0)).toNumber(),
      0,
    );

  // Sum all keys containing "output"
  const output = Object.entries(aggregatedDetails)
    .filter(([key]) => key.includes("output"))
    .reduce(
      (sum, [_, value]) =>
        new Decimal(sum).plus(new Decimal(value ?? 0)).toNumber(),
      0,
    );

  // Get total or calculate from input + output
  const total = aggregatedDetails.total ?? input + output;

  return { input, output, total };
};
