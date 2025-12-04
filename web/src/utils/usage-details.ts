import Decimal from "decimal.js";

export type UsageDetailsRecord = Record<string, number | undefined>;

type DetailsInput = UsageDetailsRecord | UsageDetailsRecord[] | undefined;

type PrefixSumResult = {
  value: number;
  hasMatches: boolean;
};

const sumByPrefix = (
  details: UsageDetailsRecord,
  prefix: string,
  { excludeExactKey = false }: { excludeExactKey?: boolean } = {},
): PrefixSumResult => {
  const normalizedPrefix = prefix.toLowerCase();
  let value = 0;
  let hasMatches = false;

  for (const [key, rawValue] of Object.entries(details)) {
    if (rawValue == null) continue;

    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.startsWith(normalizedPrefix)) continue;
    if (excludeExactKey && normalizedKey === normalizedPrefix) continue;

    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) continue;

    value += numericValue;
    hasMatches = true;
  }

  return { value, hasMatches };
};

const getCanonicalValue = (
  details: UsageDetailsRecord,
  key: string,
): number | null => {
  const normalizedKey = key.toLowerCase();
  for (const [entryKey, rawValue] of Object.entries(details)) {
    if (rawValue == null) continue;
    if (entryKey.toLowerCase() !== normalizedKey) continue;

    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) return null;
    return numericValue;
  }

  return null;
};

const aggregateMetric = (
  details: UsageDetailsRecord,
  prefix: string,
): number => {
  const canonicalValue = getCanonicalValue(details, prefix);
  const { value: breakdownValue, hasMatches } = sumByPrefix(details, prefix, {
    excludeExactKey: true,
  });

  if (canonicalValue != null && hasMatches) {
    return Math.max(canonicalValue, breakdownValue);
  }

  if (canonicalValue != null) {
    return canonicalValue;
  }

  if (hasMatches) {
    return breakdownValue;
  }

  return 0;
};

export const aggregateUsageDetails = (
  details: DetailsInput,
): UsageDetailsRecord => {
  if (!details) return {};

  if (!Array.isArray(details)) {
    return details ?? {};
  }

  return details.reduce<UsageDetailsRecord>((acc, curr) => {
    if (!curr) return acc;

    for (const [key, value] of Object.entries(curr)) {
      if (value == null) continue;

      const current = acc[key] ?? 0;
      acc[key] = new Decimal(current).plus(new Decimal(value)).toNumber();
    }

    return acc;
  }, {});
};

export const calculateAggregatedUsage = (
  details: DetailsInput,
): {
  input: number;
  output: number;
  total: number;
} => {
  const aggregatedDetails = aggregateUsageDetails(details);

  const input = aggregateMetric(aggregatedDetails, "input");
  const output = aggregateMetric(aggregatedDetails, "output");

  const total =
    getCanonicalValue(aggregatedDetails, "total") ??
    (input || output ? input + output : 0);

  return {
    input,
    output,
    total,
  };
};
