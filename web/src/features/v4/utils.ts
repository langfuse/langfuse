import {
  toAbsoluteTimeRange,
  type AbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

export const V4_TIME_RANGE_PRESETS = [
  "last5Minutes",
  "last30Minutes",
  "last1Hour",
  "last3Hours",
  "last1Day",
  "last7Days",
  "last30Days",
] as const;

export const MAX_V4_TIMELINE_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export const getV4MigrationStatus = (migrationItemCount: number) =>
  migrationItemCount > 0
    ? ({
        label: "Not migrated",
        badgeVariant: "warning",
      } as const)
    : ({
        label: "Migrated",
        badgeVariant: "success",
      } as const);

export const normalizeLegacyApiEntrypoint = (entrypoint: string) =>
  entrypoint.replace(/^publicapi:\s*/, "");

export const countLegacyApiEntrypoints = (
  rows: Array<{ entrypoint: string }> | undefined,
): number => {
  const entrypoints = new Set<string>();

  for (const row of rows ?? []) {
    const entrypoint = normalizeLegacyApiEntrypoint(row.entrypoint);
    if (entrypoint) entrypoints.add(entrypoint);
  }

  return entrypoints.size;
};

export const getCappedAbsoluteTimeRange = (
  timeRange: TimeRange,
): AbsoluteTimeRange => {
  const absoluteRange =
    toAbsoluteTimeRange(timeRange) ??
    ({
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(),
    } satisfies AbsoluteTimeRange);

  if (
    absoluteRange.to.getTime() - absoluteRange.from.getTime() <=
    MAX_V4_TIMELINE_RANGE_MS
  ) {
    return absoluteRange;
  }

  return {
    from: new Date(absoluteRange.to.getTime() - MAX_V4_TIMELINE_RANGE_MS),
    to: absoluteRange.to,
  };
};
