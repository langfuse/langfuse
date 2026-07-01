import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/src/components/ui/badge";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import {
  getV4MigrationStatus,
  normalizeLegacyApiEntrypoint,
} from "@/src/features/v4/utils";
import { compactNumberFormatter, numberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

export type V4LegacyIntegrations = {
  posthog: boolean;
  mixpanel: boolean;
  blobStorage: boolean;
};

export type V4LegacyIntegrationSummary = {
  legacyIntegrationCount: number;
  legacyIntegrations: V4LegacyIntegrations;
};

export type V4LegacyApiUsagePoint = {
  time: string;
  entrypoint: string;
  count: number;
};

export type V4TraceLevelEvalExecutionPoint = {
  time: string;
  scoreName: string;
  count: number;
};

type ProductHref = string | { pathname: string; query: Record<string, string> };

type UsageSeries = {
  name: string;
  total: number;
  points: number[];
  lastSeen?: string;
};

type StackedUsageChartSeries = UsageSeries & {
  key: string;
  color: string;
};

const V4_DOCS_LINK = {
  label: "Docs",
  href: "https://langfuse.com/docs/v4",
} as const;

const MAX_STACKED_CHART_SERIES = 6;
const STACKED_CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-3))",
] as const;

export const INTEGRATION_LINKS = [
  {
    key: "posthog",
    label: "PostHog",
    path: "posthog",
  },
  {
    key: "mixpanel",
    label: "Mixpanel",
    path: "mixpanel",
  },
  {
    key: "blobStorage",
    label: "Blob Storage",
    path: "blobstorage",
  },
] as const satisfies ReadonlyArray<{
  key: keyof V4LegacyIntegrations;
  label: string;
  path: string;
}>;

export const getTraceLevelEvalsHref = (projectId: string) => ({
  pathname: `/project/${projectId}/evals`,
  query: {
    filter: encodeFiltersGeneric([
      {
        column: "target",
        type: "stringOptions",
        operator: "any of",
        value: ["trace"],
      },
    ]),
  },
});

const getBucketTimes = (rows: Array<{ time: string }>): string[] =>
  Array.from(new Set(rows.map((row) => row.time))).sort();

const getBucketLabel = (time: string) => {
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? time : format(date, "MMM d, HH:mm");
};

const groupUsageSeries = <T extends { time: string; count: number }>({
  rows,
  getName,
  bucketTimes,
}: {
  rows: T[] | undefined;
  getName: (row: T) => string;
  bucketTimes?: string[];
}): UsageSeries[] => {
  const times = bucketTimes ?? getBucketTimes(rows ?? []);
  const groups = new Map<
    string,
    {
      total: number;
      countsByTime: Map<string, number>;
      lastSeen?: string;
    }
  >();

  for (const row of rows ?? []) {
    const name = getName(row);
    if (!name) continue;

    const group =
      groups.get(name) ??
      ({
        total: 0,
        countsByTime: new Map<string, number>(),
      } satisfies {
        total: number;
        countsByTime: Map<string, number>;
        lastSeen?: string;
      });
    group.total += row.count;
    group.countsByTime.set(
      row.time,
      (group.countsByTime.get(row.time) ?? 0) + row.count,
    );

    if (row.count > 0 && (!group.lastSeen || row.time > group.lastSeen)) {
      group.lastSeen = row.time;
    }

    groups.set(name, group);
  }

  return Array.from(groups.entries())
    .map(([name, group]) => ({
      name,
      total: group.total,
      points: times.map((time) => group.countsByTime.get(time) ?? 0),
      lastSeen: group.lastSeen,
    }))
    .filter((series) => series.total > 0)
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      return left.name.localeCompare(right.name);
    });
};

const Notice = ({ children }: { children: ReactNode }) => (
  <Alert>
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

const SectionLoading = () => (
  <div className="rounded-md border p-3">
    <div className="mb-3 flex items-center justify-between gap-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
    <Skeleton className="h-28 w-full" />
    <div className="mt-3 flex gap-3 border-t pt-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  </div>
);

const InlineLink = ({
  href,
  external,
  children,
}: {
  href: ProductHref | string;
  external?: boolean;
  children: ReactNode;
}) => {
  const className =
    "text-accent-dark-blue hover:text-primary-accent/60 inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap";

  return external ? (
    <a
      href={href as string}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  ) : (
    <Link href={href as ProductHref} className={className}>
      {children}
      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
};

const Section = ({
  title,
  count,
  isCountLoading,
  detailsHref,
  children,
}: {
  title: string;
  count: number;
  isCountLoading?: boolean;
  detailsHref: ProductHref;
  children: ReactNode;
}) => (
  <section>
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="flex items-center gap-2">
        {isCountLoading ? (
          <Skeleton className="h-5 w-8 rounded-full" />
        ) : (
          <Badge variant="outline-solid" size="sm">
            {numberFormatter(count, 0)}
          </Badge>
        )}
        <InlineLink href={detailsHref}>Go to details</InlineLink>
      </div>
    </div>
    <div className="mt-3 flex flex-col gap-2">{children}</div>
  </section>
);

const getStackedChartSeries = (
  series: UsageSeries[],
): StackedUsageChartSeries[] => {
  const visibleSeries = series.slice(0, MAX_STACKED_CHART_SERIES);
  const hiddenSeries = series.slice(MAX_STACKED_CHART_SERIES);
  const stackSeries =
    hiddenSeries.length === 0
      ? visibleSeries
      : [
          ...visibleSeries,
          {
            name: "Other",
            total: hiddenSeries.reduce((total, item) => total + item.total, 0),
            points: visibleSeries[0]?.points.map((_, index) =>
              hiddenSeries.reduce(
                (total, item) => total + (item.points[index] ?? 0),
                0,
              ),
            ) ?? [0],
          },
        ];

  return stackSeries.map((item, index) => ({
    ...item,
    key: `series_${index}`,
    color: STACKED_CHART_COLORS[index % STACKED_CHART_COLORS.length],
  }));
};

const UsageStackedBarOverview = ({
  bucketTimes,
  series,
  valueLabel,
}: {
  bucketTimes: string[];
  series: UsageSeries[];
  valueLabel: string;
}) => {
  const chartSeries = useMemo(() => getStackedChartSeries(series), [series]);
  const chartData = useMemo(
    () =>
      bucketTimes.map((time, bucketIndex) => {
        const row: Record<string, string | number> = {
          timeLabel: getBucketLabel(time),
        };

        for (const item of chartSeries) {
          row[item.key] = item.points[bucketIndex] ?? 0;
        }

        return row;
      }),
    [bucketTimes, chartSeries],
  );
  const chartConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        chartSeries.map((item) => [
          item.key,
          {
            label: item.name,
            color: item.color,
          },
        ]),
      ),
    [chartSeries],
  );
  const total = series.reduce((sum, item) => sum + item.total, 0);

  if (chartSeries.length === 0 || chartData.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Usage over time</span>
        <span className="text-muted-foreground text-xs">
          {numberFormatter(total, 0, 2)} {valueLabel}
        </span>
      </div>
      <ChartContainer config={chartConfig} className="h-32">
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: -18 }}
        >
          <XAxis
            dataKey="timeLabel"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border) / 0.5)" }}
            minTickGap={24}
            fontSize={11}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={42}
            fontSize={11}
            tickFormatter={(value) => compactNumberFormatter(Number(value), 1)}
          />
          <ChartTooltip
            cursor={false}
            contentStyle={{ backgroundColor: "hsl(var(--background))" }}
            content={({ active, payload, label }) => (
              <ChartTooltipContent
                active={active}
                payload={payload}
                label={label}
                valueFormatter={(value) => numberFormatter(Number(value), 0, 2)}
                sortPayloadByValue="desc"
              />
            )}
          />
          {chartSeries.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="usage"
              fill={item.color}
              radius={
                index === chartSeries.length - 1 ? [3, 3, 0, 0] : undefined
              }
            />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
        {chartSeries.map((item) => (
          <div
            key={item.key}
            className="flex max-w-full min-w-0 items-center gap-2 text-xs sm:max-w-80"
            title={item.name}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate font-medium" title={item.name}>
              {item.name}
            </span>
            <span className="text-muted-foreground shrink-0">
              {numberFormatter(item.total, 0, 2)} {valueLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActionRow = ({
  title,
  titleClassName,
  detail,
  total,
  usageLabel,
}: {
  title: string;
  titleClassName?: string;
  detail: string;
  total?: number;
  usageLabel?: string;
}) => (
  <div className="grid gap-3 rounded-md border px-3 py-2 md:grid-cols-[minmax(0,1fr)_8rem] md:items-center">
    <div className="min-w-0">
      <div
        className={cn("truncate text-sm font-medium", titleClassName)}
        title={title}
      >
        {title}
      </div>
      <div
        className="text-muted-foreground mt-0.5 truncate text-xs"
        title={detail}
      >
        {detail}
      </div>
    </div>
    <div className="md:text-right">
      {typeof total === "number" ? (
        <>
          <div className="text-sm font-medium">
            {numberFormatter(total, 0, 2)}
          </div>
          <div className="text-muted-foreground text-xs">
            {usageLabel ?? "uses"}
          </div>
        </>
      ) : (
        <span className="text-muted-foreground text-sm">Configuration</span>
      )}
    </div>
  </div>
);

export const V4MigrationProjectCards = ({
  projectId,
  projectName,
  legacyIntegrationSummary,
  traceLevelEvalCount: configuredTraceLevelEvalCount,
  legacyApiUsage,
  traceLevelEvalExecutions,
  isLegacyIntegrationSummaryLoading,
  isTraceLevelEvalSummaryLoading,
  isLegacyApiUsageLoading,
  isTraceLevelEvalExecutionsLoading,
  hasLegacyIntegrationSummaryError,
  hasTraceLevelEvalSummaryError,
  hasLegacyApiUsageError,
  hasTraceLevelEvalExecutionsError,
}: {
  projectId: string;
  projectName?: string;
  legacyIntegrationSummary: V4LegacyIntegrationSummary | undefined;
  traceLevelEvalCount: number | undefined;
  legacyApiUsage: V4LegacyApiUsagePoint[] | undefined;
  traceLevelEvalExecutions: V4TraceLevelEvalExecutionPoint[] | undefined;
  isLegacyIntegrationSummaryLoading: boolean;
  isTraceLevelEvalSummaryLoading: boolean;
  isLegacyApiUsageLoading: boolean;
  isTraceLevelEvalExecutionsLoading: boolean;
  hasLegacyIntegrationSummaryError: boolean;
  hasTraceLevelEvalSummaryError: boolean;
  hasLegacyApiUsageError: boolean;
  hasTraceLevelEvalExecutionsError: boolean;
}) => {
  const traceLevelEvalsHref = useMemo(
    () => getTraceLevelEvalsHref(projectId),
    [projectId],
  );

  const legacyApiBucketTimes = useMemo(
    () => getBucketTimes(legacyApiUsage ?? []),
    [legacyApiUsage],
  );
  const legacyApiSeries = useMemo(() => {
    return groupUsageSeries({
      rows: legacyApiUsage,
      getName: (row) => normalizeLegacyApiEntrypoint(row.entrypoint),
      bucketTimes: legacyApiBucketTimes,
    });
  }, [legacyApiBucketTimes, legacyApiUsage]);

  const evalExecutionBucketTimes = useMemo(
    () => getBucketTimes(traceLevelEvalExecutions ?? []),
    [traceLevelEvalExecutions],
  );
  const evalExecutionSeries = useMemo(
    () =>
      groupUsageSeries({
        rows: traceLevelEvalExecutions,
        getName: (row) => row.scoreName,
        bucketTimes: evalExecutionBucketTimes,
      }),
    [evalExecutionBucketTimes, traceLevelEvalExecutions],
  );

  const legacyIntegrationLinks = useMemo(
    () =>
      INTEGRATION_LINKS.filter(
        (link) =>
          legacyIntegrationSummary?.legacyIntegrations[link.key] === true,
      ),
    [legacyIntegrationSummary?.legacyIntegrations],
  );

  const hasAnyError =
    hasLegacyIntegrationSummaryError ||
    hasTraceLevelEvalSummaryError ||
    hasLegacyApiUsageError ||
    hasTraceLevelEvalExecutionsError;
  const traceLevelEvalCount =
    configuredTraceLevelEvalCount ?? evalExecutionSeries.length;
  const activeTaskCount =
    legacyApiSeries.length +
    traceLevelEvalCount +
    legacyIntegrationLinks.length;
  const migrationStatus = getV4MigrationStatus(activeTaskCount);
  const isSummaryLoading =
    isLegacyIntegrationSummaryLoading || isTraceLevelEvalSummaryLoading;
  const isTimelineLoading =
    isLegacyApiUsageLoading || isTraceLevelEvalExecutionsLoading;

  return (
    <DashboardCard
      title="Required changes"
      description={
        isSummaryLoading
          ? "Loading V4 migration data."
          : hasAnyError
            ? `${projectName ? `${projectName} - ` : ""}Some migration data could not be loaded.`
            : isTimelineLoading
              ? `${projectName ? `${projectName} - ` : ""}Loading usage timelines.`
              : `${projectName ? `${projectName} - ` : ""}${numberFormatter(
                  activeTaskCount,
                  0,
                )} required ${
                  activeTaskCount === 1 ? "change" : "changes"
                } in the selected time range`
      }
      isLoading={isSummaryLoading}
      headerRight={
        isSummaryLoading ? undefined : (
          <div className="flex items-center gap-2">
            <InlineLink href={V4_DOCS_LINK.href} external>
              {V4_DOCS_LINK.label}
            </InlineLink>
            <Badge
              variant={
                hasAnyError || isTimelineLoading
                  ? "outline-solid"
                  : migrationStatus.badgeVariant
              }
              className="whitespace-nowrap"
            >
              {hasAnyError
                ? "Unavailable"
                : isTimelineLoading
                  ? "Loading"
                  : migrationStatus.label}
            </Badge>
          </div>
        )
      }
    >
      <Section
        title="Legacy public APIs"
        count={legacyApiSeries.length}
        isCountLoading={isLegacyApiUsageLoading}
        detailsHref={`/project/${projectId}/settings/api-keys`}
      >
        {isLegacyApiUsageLoading ? (
          <SectionLoading />
        ) : hasLegacyApiUsageError ? (
          <Notice>Failed to load public API usage.</Notice>
        ) : legacyApiSeries.length ? (
          <UsageStackedBarOverview
            bucketTimes={legacyApiBucketTimes}
            series={legacyApiSeries}
            valueLabel="calls"
          />
        ) : (
          <Notice>No legacy public API usage in this range.</Notice>
        )}
      </Section>

      <Section
        title="Trace-level evals"
        count={traceLevelEvalCount}
        isCountLoading={isTraceLevelEvalSummaryLoading}
        detailsHref={traceLevelEvalsHref}
      >
        {isTraceLevelEvalSummaryLoading || isTraceLevelEvalExecutionsLoading ? (
          <SectionLoading />
        ) : hasTraceLevelEvalSummaryError ||
          hasTraceLevelEvalExecutionsError ? (
          <Notice>Failed to load trace-level eval data.</Notice>
        ) : evalExecutionSeries.length ? (
          <UsageStackedBarOverview
            bucketTimes={evalExecutionBucketTimes}
            series={evalExecutionSeries}
            valueLabel="executions"
          />
        ) : traceLevelEvalCount > 0 ? (
          <ActionRow
            title={`${numberFormatter(
              traceLevelEvalCount,
              0,
            )} configured trace-level evals`}
            detail="No executions found in the selected range."
          />
        ) : (
          <Notice>No trace-level evals detected.</Notice>
        )}
      </Section>

      <Section
        title="Integrations"
        count={legacyIntegrationLinks.length}
        isCountLoading={isLegacyIntegrationSummaryLoading}
        detailsHref={`/project/${projectId}/settings/integrations`}
      >
        {isLegacyIntegrationSummaryLoading ? (
          <SectionLoading />
        ) : hasLegacyIntegrationSummaryError ? (
          <Notice>Failed to load integration data.</Notice>
        ) : legacyIntegrationLinks.length ? (
          legacyIntegrationLinks.map((integration) => (
            <ActionRow
              key={integration.key}
              title={integration.label}
              detail="Legacy traces and observations export is enabled."
            />
          ))
        ) : (
          <Notice>No legacy integration exports detected.</Notice>
        )}
      </Section>
    </DashboardCard>
  );
};
