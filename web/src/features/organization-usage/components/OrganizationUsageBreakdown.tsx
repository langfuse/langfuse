/* eslint-disable no-nested-ternary */
import { useMemo, useState } from "react";
import { DownloadIcon } from "lucide-react";

import { Card } from "@/src/components/ui/card";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { TimeRangePicker } from "@/src/components/date-picker";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  downloadChartDataCsv,
  VerticalBarChartTimeSeries,
  type DataPoint,
} from "@/src/features/widgets";
import { USAGE_BREAKDOWN_MAX_RANGE_MS } from "@/src/features/organization-usage/constants/usageBreakdown";
import { api } from "@/src/utils/api";
import { numberFormatter } from "@/src/utils/numbers";
import {
  toAbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import type { RouterOutput } from "@/src/utils/types";

type UsageBreakdown = RouterOutput["organizationUsage"]["breakdown"];
type GroupBy = "project" | "type";

const TIME_RANGE_PRESETS = [
  "last1Day",
  "last7Days",
  "last30Days",
  "last90Days",
  "last1Year",
] as const;

const UNIT_TYPE_LABELS: Record<
  UsageBreakdown["rows"][number]["unitType"],
  string
> = {
  traces: "Traces",
  observations: "Observations",
  scores: "Scores",
};

const GRANULARITY_LABELS: Record<UsageBreakdown["granularity"], string> = {
  hour: "hourly",
  day: "daily",
  week: "weekly",
  month: "monthly",
};

/**
 * Turns the breakdown rows into one series per project or unit type. Every
 * (bucket, series) cell is explicit — a count with no rows is a real `0` — so
 * empty periods keep their slot on the axis. Series are ordered by total,
 * largest first, so the top consumers get the leading palette colors.
 */
const toChartData = (breakdown: UsageBreakdown, groupBy: GroupBy) => {
  const totalsBySeries = new Map<string, number>();
  const counts = new Map<string, Map<string, number>>();

  for (const row of breakdown.rows) {
    const series = groupBy === "project" ? row.projectId : row.unitType;
    totalsBySeries.set(series, (totalsBySeries.get(series) ?? 0) + row.count);
    const bySeries = counts.get(row.bucket) ?? new Map<string, number>();
    bySeries.set(series, (bySeries.get(series) ?? 0) + row.count);
    counts.set(row.bucket, bySeries);
  }

  const seriesOrder = [...totalsBySeries.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([series]) => series);

  const data: DataPoint[] = breakdown.buckets.flatMap((bucket) =>
    seriesOrder.map((series) => ({
      time_dimension: bucket,
      dimension: series,
      metric: counts.get(bucket)?.get(series) ?? 0,
    })),
  );

  const projectNames = new Map(
    breakdown.projects.map((project) => [project.id, project.name]),
  );
  const config = Object.fromEntries(
    seriesOrder.map((series) => [
      series,
      {
        label:
          groupBy === "project"
            ? (projectNames.get(series) ?? series)
            : UNIT_TYPE_LABELS[series as keyof typeof UNIT_TYPE_LABELS],
      },
    ]),
  );

  const total = [...totalsBySeries.values()].reduce((sum, n) => sum + n, 0);

  return { data, config, total };
};

/**
 * One row per bucket, project and unit type, independent of the chart's
 * grouping, so either view can be rebuilt offline with a pivot. Cells without
 * usage are left out.
 */
const toCsvRows = (breakdown: UsageBreakdown) => {
  const projectNames = new Map(
    breakdown.projects.map((project) => [project.id, project.name]),
  );
  return breakdown.rows
    .map((row) => ({
      bucket_start_utc: row.bucket,
      project_id: row.projectId,
      project_name: projectNames.get(row.projectId) ?? "",
      unit_type: row.unitType,
      units: row.count,
    }))
    .sort(
      (a, b) =>
        a.bucket_start_utc.localeCompare(b.bucket_start_utc) ||
        a.project_name.localeCompare(b.project_name) ||
        a.unit_type.localeCompare(b.unit_type),
    );
};

const toCsvFileName = (breakdown: UsageBreakdown, from: Date, to: Date) => {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return `usage-breakdown-${GRANULARITY_LABELS[breakdown.granularity]}-${day(from)}-to-${day(to)}`;
};

export const OrganizationUsageBreakdown = ({ orgId }: { orgId: string }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>({
    range: "last30Days",
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("project");

  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange),
    [timeRange],
  );

  const breakdown = api.organizationUsage.breakdown.useQuery(
    {
      orgId,
      from: absoluteTimeRange?.from ?? new Date(),
      to: absoluteTimeRange?.to ?? new Date(),
    },
    {
      enabled: Boolean(absoluteTimeRange),
      trpc: { context: { skipBatch: true } },
    },
  );

  const chart = useMemo(
    () => (breakdown.data ? toChartData(breakdown.data, groupBy) : null),
    [breakdown.data, groupBy],
  );

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">Usage breakdown</h3>
          <p className="text-muted-foreground text-sm">
            {chart && breakdown.data
              ? `${numberFormatter(chart.total, 0)} units, ${GRANULARITY_LABELS[breakdown.data.granularity]} buckets (UTC)`
              : "Units (traces, observations, scores)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={groupBy}
            onValueChange={(value) => setGroupBy(value as GroupBy)}
          >
            <Tabs.List aria-label="Group usage by">
              <Tabs.Trigger value="project" label="By project" />
              <Tabs.Trigger value="type" label="By type" />
            </Tabs.List>
          </Tabs>
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={TIME_RANGE_PRESETS}
            maxRangeMs={USAGE_BREAKDOWN_MAX_RANGE_MS}
          />
          <Tooltip label="Download as CSV">
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                icon={DownloadIcon}
                label="Download usage breakdown as CSV"
                variant="outline"
                disabled={!chart || chart.total === 0}
                onClick={() => {
                  if (!breakdown.data || !absoluteTimeRange) return;
                  downloadChartDataCsv(
                    toCsvRows(breakdown.data),
                    toCsvFileName(
                      breakdown.data,
                      absoluteTimeRange.from,
                      absoluteTimeRange.to,
                    ),
                  );
                }}
              />
            )}
          </Tooltip>
        </div>
      </div>
      <div className="h-80">
        {breakdown.isError ? (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-md border border-dashed text-sm">
            Failed to load usage breakdown
          </div>
        ) : chart && chart.total > 0 ? (
          <VerticalBarChartTimeSeries
            data={chart.data}
            config={chart.config}
            legendPosition="below"
            legendSummary="sum"
            legendInteraction="toggle"
          />
        ) : (
          <NoDataOrLoading isLoading={breakdown.isLoading} className="h-full" />
        )}
      </div>
    </Card>
  );
};
