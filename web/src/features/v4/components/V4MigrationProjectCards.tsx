import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  ChevronRight,
  CircleCheck,
  Clock,
  ExternalLink,
  Info,
  TriangleAlert,
} from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/src/components/ui/badge";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/src/components/ui/chart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import {
  V4_LEGACY_EXPORT_AUTO_SWITCH_COPY,
  V4_MIGRATION_DEADLINE_SHORT_LABEL,
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

export type V4SdkUsagePoint = {
  time: string;
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  canonicalSdkName: "python" | "javascript" | null;
  latestMajor: number | null;
  major: number | null;
  upgradeStatus:
    | "current"
    | "outdated_major"
    | "unknown"
    | "unsupported_sdk"
    | "invalid_version";
};

export type V4SdkUsageTimeSeries = {
  bucketTimes: string[];
  rows: V4SdkUsagePoint[];
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

type SdkUsageSeries = UsageSeries & {
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
  canonicalSdkName: V4SdkUsagePoint["canonicalSdkName"];
  firstSeen?: string;
  upgradeStatus: V4SdkUsagePoint["upgradeStatus"];
  latestMajor: number | null;
  major: number | null;
};

const V4_DOCS_LINK = {
  label: "Docs",
  href: "https://langfuse.com/docs/v4",
} as const;

const SDK_UPGRADE_LINKS = {
  python:
    "https://langfuse.com/docs/observability/sdk/upgrade-path/python-v3-to-v4",
  javascript:
    "https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5",
} as const;

const MAX_STACKED_CHART_SERIES = 6;
const STACKED_CHART_Y_AXIS_TICK_COUNT = 5;
const STACKED_CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-3))",
] as const;

const formatCountLabel = (
  count: number,
  singular: string,
  plural = `${singular}s`,
) => `${numberFormatter(count, 0)} ${count === 1 ? singular : plural}`;

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

const getSdkUsageSeriesKey = (row: {
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
}): string => `${row.sdkName}\u0000${row.sdkVersion}\u0000${row.publicKey}`;

const getCompactPublicKey = (publicKey: string) =>
  publicKey.length > 16
    ? `${publicKey.slice(0, 9)}...${publicKey.slice(-6)}`
    : publicKey || "No API key";

const isUntrackedSdkUsage = (row: {
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
}) =>
  row.publicKey === "" &&
  (row.sdkName || "unknown") === "unknown" &&
  (row.sdkVersion || "unknown") === "unknown";

const getSdkPackageLabel = (row: { sdkName: string; sdkVersion: string }) =>
  `${row.sdkName || "unknown"}@${row.sdkVersion || "unknown"}`;

const getSdkUsageSeriesName = (row: {
  sdkName: string;
  sdkVersion: string;
  publicKey: string;
}) =>
  isUntrackedSdkUsage(row)
    ? "untracked"
    : `${getSdkPackageLabel(row)} - ${getCompactPublicKey(row.publicKey)}`;

const getSdkUpgradeStatusLabel = (status: V4SdkUsagePoint["upgradeStatus"]) => {
  switch (status) {
    case "current":
      return "Current";
    case "outdated_major":
      return "Upgrade";
    case "unknown":
      return "Unknown";
    case "unsupported_sdk":
      return "Other";
    case "invalid_version":
      return "Invalid";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
};

const getSdkUpgradeStatusBadgeVariant = (
  status: V4SdkUsagePoint["upgradeStatus"],
): "success" | "warning" | "outline-solid" =>
  status === "current"
    ? "success"
    : status === "outdated_major"
      ? "warning"
      : "outline-solid";

const groupSdkUsageSeries = ({
  rows,
  bucketTimes,
}: {
  rows: V4SdkUsagePoint[] | undefined;
  bucketTimes: string[];
}): SdkUsageSeries[] => {
  const groups = new Map<
    string,
    {
      sdkName: string;
      sdkVersion: string;
      publicKey: string;
      canonicalSdkName: V4SdkUsagePoint["canonicalSdkName"];
      upgradeStatus: V4SdkUsagePoint["upgradeStatus"];
      latestMajor: number | null;
      major: number | null;
      total: number;
      countsByTime: Map<string, number>;
      firstSeen?: string;
      lastSeen?: string;
    }
  >();

  for (const row of rows ?? []) {
    const key = getSdkUsageSeriesKey(row);
    const group =
      groups.get(key) ??
      ({
        sdkName: row.sdkName,
        sdkVersion: row.sdkVersion,
        publicKey: row.publicKey,
        canonicalSdkName: row.canonicalSdkName,
        upgradeStatus: row.upgradeStatus,
        latestMajor: row.latestMajor,
        major: row.major,
        total: 0,
        countsByTime: new Map<string, number>(),
      } satisfies {
        sdkName: string;
        sdkVersion: string;
        publicKey: string;
        canonicalSdkName: V4SdkUsagePoint["canonicalSdkName"];
        upgradeStatus: V4SdkUsagePoint["upgradeStatus"];
        latestMajor: number | null;
        major: number | null;
        total: number;
        countsByTime: Map<string, number>;
        firstSeen?: string;
        lastSeen?: string;
      });

    group.total += row.count;
    group.countsByTime.set(
      row.time,
      (group.countsByTime.get(row.time) ?? 0) + row.count,
    );

    if (row.count > 0) {
      if (
        row.firstSeen &&
        (!group.firstSeen || row.firstSeen < group.firstSeen)
      ) {
        group.firstSeen = row.firstSeen;
      }
      if (row.lastSeen && (!group.lastSeen || row.lastSeen > group.lastSeen)) {
        group.lastSeen = row.lastSeen;
      }
    }

    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      name: getSdkUsageSeriesName(group),
      sdkName: group.sdkName,
      sdkVersion: group.sdkVersion,
      publicKey: group.publicKey,
      canonicalSdkName: group.canonicalSdkName,
      upgradeStatus: group.upgradeStatus,
      latestMajor: group.latestMajor,
      major: group.major,
      total: group.total,
      points: bucketTimes.map((time) => group.countsByTime.get(time) ?? 0),
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
    }))
    .filter((series) => series.total > 0)
    .sort((left, right) => {
      if (
        left.upgradeStatus === "outdated_major" &&
        right.upgradeStatus !== "outdated_major"
      ) {
        return -1;
      }
      if (
        right.upgradeStatus === "outdated_major" &&
        left.upgradeStatus !== "outdated_major"
      ) {
        return 1;
      }
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
  <div className="border-dark-yellow/30 grid gap-3 border-l-2 py-1 pl-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
    <Skeleton className="h-28 w-full" />
    <div className="flex gap-3">
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
    "text-link hover:text-link-hover inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap";

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

const DeadlineBadge = () => (
  <Badge variant="warning" className="inline-flex items-center gap-1">
    <Clock className="h-3 w-3" />
    {V4_MIGRATION_DEADLINE_SHORT_LABEL}
  </Badge>
);

const AuditSection = ({
  title,
  countLabel,
  consequence,
  detailsHref,
  children,
}: {
  title: string;
  countLabel: string;
  consequence: string;
  detailsHref: ProductHref;
  children: ReactNode;
}) => (
  <section className="border-dark-yellow/60 grid gap-3 border-l-2 py-1 pl-4">
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TriangleAlert className="text-dark-yellow h-4 w-4 shrink-0" />
          <h3 className="text-sm font-bold">{title}</h3>
          <Badge variant="outline-solid" size="sm">
            {countLabel}
          </Badge>
          <DeadlineBadge />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{consequence}</p>
      </div>
      <div className="shrink-0">
        <InlineLink href={detailsHref}>Go to details</InlineLink>
      </div>
    </div>
    <div className="flex flex-col gap-2">{children}</div>
  </section>
);

const SuccessAudit = () => (
  <div className="border-light-green flex items-start gap-3 border-l-2 py-2 pl-4">
    <CircleCheck className="text-dark-green mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0">
      <div className="text-sm font-bold">
        No required v4 migration changes detected
      </div>
      <div className="text-muted-foreground mt-0.5 text-sm">
        The selected range has no required customer action for v4.
      </div>
    </div>
  </div>
);

const PassedCheckRow = ({ children }: { children: ReactNode }) => (
  <div className="flex items-start gap-2 py-1.5 text-sm">
    <CircleCheck className="text-dark-green h-4 w-4 shrink-0" />
    <span className="min-w-0">{children}</span>
  </div>
);

const NonActionDetails = ({
  bucketTimes,
  sdkUsageSeries,
  passedChecks,
}: {
  bucketTimes: string[];
  sdkUsageSeries: SdkUsageSeries[];
  passedChecks: ReactNode[];
}) => {
  if (sdkUsageSeries.length === 0 && passedChecks.length === 0) return null;

  return (
    <Accordion
      type="single"
      collapsible
      className="pt-1"
      data-testid="non-action-details"
    >
      <AccordionItem value="details" className="border-b-0">
        <AccordionTrigger className="py-3 text-sm hover:no-underline">
          <span className="flex min-w-0 items-center gap-2">
            <Info className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="font-bold">
              Details that do not require action
            </span>
            <Badge variant="outline-solid" size="sm">
              {numberFormatter(sdkUsageSeries.length + passedChecks.length, 0)}
            </Badge>
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5 pt-1">
          {sdkUsageSeries.length ? (
            <section className="flex flex-col gap-2">
              <div>
                <h4 className="text-sm font-bold">SDK telemetry</h4>
                <p className="text-muted-foreground text-xs">
                  Current, unknown with API keys, unsupported, and invalid SDK
                  telemetry is shown for context only.
                </p>
              </div>
              <SdkUsageDetails
                bucketTimes={bucketTimes}
                series={sdkUsageSeries}
              />
            </section>
          ) : null}
          {passedChecks.length ? (
            <section className="flex flex-col gap-2">
              <div>
                <h4 className="text-sm font-bold">Passed checks</h4>
                <p className="text-muted-foreground text-xs">
                  These checks did not produce required customer work in the
                  selected range.
                </p>
              </div>
              <div className="grid gap-1">
                {passedChecks.map((check, index) => (
                  <PassedCheckRow key={index}>{check}</PassedCheckRow>
                ))}
              </div>
            </section>
          ) : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const getStackedChartSeries = (
  series: UsageSeries[],
  seriesLimit: number | null = MAX_STACKED_CHART_SERIES,
): StackedUsageChartSeries[] => {
  const visibleSeries =
    seriesLimit === null ? series : series.slice(0, seriesLimit);
  const hiddenSeries = seriesLimit === null ? [] : series.slice(seriesLimit);
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

const getNiceCountStep = (rawStep: number): number => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const niceStep =
    [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find(
      (step) => normalizedStep <= step,
    ) ?? 10;

  return Math.max(1, Math.ceil(niceStep * magnitude));
};

const getStackedYAxisTicks = (
  series: UsageSeries[],
  tickCount = STACKED_CHART_Y_AXIS_TICK_COUNT,
): number[] => {
  const bucketCount = Math.max(0, ...series.map((item) => item.points.length));
  let maxStackedValue = 0;

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const bucketTotal = series.reduce((sum, item) => {
      const value = item.points[bucketIndex] ?? 0;
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);
    maxStackedValue = Math.max(maxStackedValue, bucketTotal);
  }

  const step = getNiceCountStep(maxStackedValue / (tickCount - 1));
  return Array.from({ length: tickCount }, (_, index) => index * step);
};

export const UsageStackedBarOverview = ({
  bucketTimes,
  series,
  valueLabel,
  seriesLimit,
}: {
  bucketTimes: string[];
  series: UsageSeries[];
  valueLabel: string;
  seriesLimit?: number | null;
}) => {
  const chartSeries = useMemo(
    () => getStackedChartSeries(series, seriesLimit),
    [series, seriesLimit],
  );
  const yAxisTicks = useMemo(
    () => getStackedYAxisTicks(chartSeries),
    [chartSeries],
  );
  const yAxisMax = yAxisTicks[yAxisTicks.length - 1] ?? 0;
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
    <div className="py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-bold">Usage over time</span>
        <span className="text-muted-foreground text-xs">
          {numberFormatter(total, 0, 2)} {valueLabel}
        </span>
      </div>
      <ChartContainer config={chartConfig} className="h-32">
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: 12 }}
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
            domain={[0, yAxisMax]}
            ticks={yAxisTicks}
            interval={0}
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
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
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
            <span className="truncate font-bold" title={item.name}>
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

const SdkUsageDetails = ({
  bucketTimes,
  series,
}: {
  bucketTimes: string[];
  series: SdkUsageSeries[];
}) => {
  const total = series.reduce((sum, item) => sum + item.total, 0);

  return (
    <div className="flex flex-col gap-3">
      <UsageStackedBarOverview
        bucketTimes={bucketTimes}
        series={series}
        valueLabel="records"
        seriesLimit={null}
      />
      <div className="overflow-hidden">
        <div className="text-muted-foreground hidden grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_7rem_7rem] gap-3 border-b py-2 text-xs font-bold md:grid">
          <span>SDK</span>
          <span>API key</span>
          <span className="text-right">Last seen</span>
          <span className="text-right">Records</span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {series.map((item) => {
            const upgradeHref =
              item.upgradeStatus === "outdated_major" && item.canonicalSdkName
                ? SDK_UPGRADE_LINKS[item.canonicalSdkName]
                : null;
            const publicKeyLabel = item.publicKey || "No API key";
            const detail = [
              item.latestMajor ? `latest major: ${item.latestMajor}` : null,
            ]
              .filter(Boolean)
              .join(" - ");

            return (
              <div
                key={getSdkUsageSeriesKey(item)}
                className="grid gap-3 border-b py-2 last:border-b-0 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_7rem_7rem] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge
                      variant={getSdkUpgradeStatusBadgeVariant(
                        item.upgradeStatus,
                      )}
                      size="sm"
                      className="shrink-0"
                    >
                      {getSdkUpgradeStatusLabel(item.upgradeStatus)}
                    </Badge>
                    <span
                      className="truncate text-sm font-bold"
                      title={
                        isUntrackedSdkUsage(item)
                          ? "untracked"
                          : getSdkPackageLabel(item)
                      }
                    >
                      {isUntrackedSdkUsage(item)
                        ? "untracked"
                        : getSdkPackageLabel(item)}
                    </span>
                  </div>
                  <div
                    className="text-muted-foreground mt-0.5 truncate text-xs"
                    title={detail}
                  >
                    {upgradeHref ? (
                      <InlineLink href={upgradeHref} external>
                        Upgrade guide
                      </InlineLink>
                    ) : (
                      detail || "No upgrade guidance"
                    )}
                  </div>
                </div>
                <div className="min-w-0 md:block">
                  <div
                    className="truncate font-mono text-xs"
                    title={publicKeyLabel}
                  >
                    {publicKeyLabel}
                  </div>
                </div>
                <div className="text-muted-foreground text-xs md:text-right">
                  {item.lastSeen ? getBucketLabel(item.lastSeen) : "-"}
                </div>
                <div className="text-sm font-bold md:text-right">
                  {numberFormatter(item.total, 0, 2)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-muted-foreground pt-2 text-right text-xs">
          {numberFormatter(total, 0, 2)} records
        </div>
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
  <div className="grid gap-3 border-b py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem] md:items-center">
    <div className="min-w-0">
      <div
        className={cn("truncate text-sm font-bold", titleClassName)}
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
          <div className="text-sm font-bold">
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
  sdkUsage,
  isLegacyIntegrationSummaryLoading,
  isTraceLevelEvalSummaryLoading,
  isLegacyApiUsageLoading,
  isTraceLevelEvalExecutionsLoading,
  isSdkUsageLoading,
  hasLegacyIntegrationSummaryError,
  hasTraceLevelEvalSummaryError,
  hasLegacyApiUsageError,
  hasTraceLevelEvalExecutionsError,
  hasSdkUsageError,
}: {
  projectId: string;
  projectName?: string;
  legacyIntegrationSummary: V4LegacyIntegrationSummary | undefined;
  traceLevelEvalCount: number | undefined;
  legacyApiUsage: V4LegacyApiUsagePoint[] | undefined;
  traceLevelEvalExecutions: V4TraceLevelEvalExecutionPoint[] | undefined;
  sdkUsage: V4SdkUsageTimeSeries | undefined;
  isLegacyIntegrationSummaryLoading: boolean;
  isTraceLevelEvalSummaryLoading: boolean;
  isLegacyApiUsageLoading: boolean;
  isTraceLevelEvalExecutionsLoading: boolean;
  isSdkUsageLoading: boolean;
  hasLegacyIntegrationSummaryError: boolean;
  hasTraceLevelEvalSummaryError: boolean;
  hasLegacyApiUsageError: boolean;
  hasTraceLevelEvalExecutionsError: boolean;
  hasSdkUsageError: boolean;
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

  const sdkUsageBucketTimes = useMemo(
    () => sdkUsage?.bucketTimes ?? [],
    [sdkUsage?.bucketTimes],
  );
  const sdkUsageRows = sdkUsage?.rows;
  const sdkUsageSeries = useMemo(
    () =>
      groupSdkUsageSeries({
        rows: sdkUsageRows,
        bucketTimes: sdkUsageBucketTimes,
      }),
    [sdkUsageBucketTimes, sdkUsageRows],
  );
  const requiredSdkUsageSeries = useMemo(
    () =>
      sdkUsageSeries.filter(
        (series) => series.upgradeStatus === "outdated_major",
      ),
    [sdkUsageSeries],
  );
  const nonActionSdkUsageSeries = useMemo(
    () =>
      sdkUsageSeries.filter(
        (series) =>
          series.upgradeStatus !== "outdated_major" &&
          !isUntrackedSdkUsage(series),
      ),
    [sdkUsageSeries],
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
    hasTraceLevelEvalExecutionsError ||
    hasSdkUsageError;
  const traceLevelEvalCount =
    configuredTraceLevelEvalCount ?? evalExecutionSeries.length;
  const activeTaskCount =
    legacyApiSeries.length +
    traceLevelEvalCount +
    legacyIntegrationLinks.length +
    requiredSdkUsageSeries.length;
  const migrationStatus = getV4MigrationStatus(activeTaskCount);
  const isSummaryLoading =
    isLegacyIntegrationSummaryLoading || isTraceLevelEvalSummaryLoading;
  const isTimelineLoading =
    isLegacyApiUsageLoading ||
    isTraceLevelEvalExecutionsLoading ||
    isSdkUsageLoading;
  const passedChecks = useMemo(() => {
    const checks: ReactNode[] = [];

    if (!isLegacyApiUsageLoading && !hasLegacyApiUsageError) {
      if (legacyApiSeries.length === 0) {
        checks.push("No legacy public API usage in this range.");
      }
    }

    if (!isSdkUsageLoading && !hasSdkUsageError) {
      if (requiredSdkUsageSeries.length === 0) {
        checks.push(
          sdkUsageSeries.length
            ? "No outdated major SDK usage detected."
            : "No SDK usage detected in this range.",
        );
      }
    }

    if (
      !isTraceLevelEvalSummaryLoading &&
      !isTraceLevelEvalExecutionsLoading &&
      !hasTraceLevelEvalSummaryError &&
      !hasTraceLevelEvalExecutionsError &&
      traceLevelEvalCount === 0
    ) {
      checks.push("No trace-level evals detected.");
    }

    if (
      !isLegacyIntegrationSummaryLoading &&
      !hasLegacyIntegrationSummaryError &&
      legacyIntegrationLinks.length === 0
    ) {
      checks.push("No legacy integration exports detected.");
    }

    return checks;
  }, [
    hasLegacyApiUsageError,
    hasLegacyIntegrationSummaryError,
    hasSdkUsageError,
    hasTraceLevelEvalExecutionsError,
    hasTraceLevelEvalSummaryError,
    isLegacyApiUsageLoading,
    isLegacyIntegrationSummaryLoading,
    isSdkUsageLoading,
    isTraceLevelEvalExecutionsLoading,
    isTraceLevelEvalSummaryLoading,
    legacyApiSeries.length,
    legacyIntegrationLinks.length,
    requiredSdkUsageSeries.length,
    sdkUsageSeries.length,
    traceLevelEvalCount,
  ]);

  return (
    <DashboardCard
      className="border-0 bg-transparent shadow-none"
      title="V4 migration audit"
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
          <div className="flex flex-wrap items-center justify-end gap-2">
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
            <DeadlineBadge />
          </div>
        )
      }
      headerClassName="px-0 pt-0"
      cardContentClassName="gap-5 px-0 pb-0"
    >
      <div className="flex flex-col gap-5" data-testid="required-actions">
        {isSdkUsageLoading ? (
          <SectionLoading />
        ) : hasSdkUsageError ? (
          <Notice>Failed to load SDK usage.</Notice>
        ) : requiredSdkUsageSeries.length ? (
          <AuditSection
            title="SDK upgrades"
            countLabel={`${numberFormatter(
              requiredSdkUsageSeries.length,
              0,
            )} outdated`}
            consequence="Upgrade all SDKs that are not on the latest major version before the migration deadline."
            detailsHref={`/project/${projectId}/settings/api-keys`}
          >
            <SdkUsageDetails
              bucketTimes={sdkUsageBucketTimes}
              series={requiredSdkUsageSeries}
            />
          </AuditSection>
        ) : null}

        {isLegacyApiUsageLoading ? (
          <SectionLoading />
        ) : hasLegacyApiUsageError ? (
          <Notice>Failed to load public API usage.</Notice>
        ) : legacyApiSeries.length ? (
          <AuditSection
            title="Legacy public APIs"
            countLabel={formatCountLabel(legacyApiSeries.length, "route")}
            consequence="Replace legacy public API reads with v4-compatible APIs before the migration deadline."
            detailsHref={`/project/${projectId}/settings/api-keys`}
          >
            <UsageStackedBarOverview
              bucketTimes={legacyApiBucketTimes}
              series={legacyApiSeries}
              valueLabel="calls"
            />
          </AuditSection>
        ) : null}

        {isTraceLevelEvalSummaryLoading || isTraceLevelEvalExecutionsLoading ? (
          <SectionLoading />
        ) : hasTraceLevelEvalSummaryError ||
          hasTraceLevelEvalExecutionsError ? (
          <Notice>Failed to load trace-level eval data.</Notice>
        ) : traceLevelEvalCount > 0 ? (
          <AuditSection
            title="Trace-level evals"
            countLabel={`${numberFormatter(traceLevelEvalCount, 0)} configured`}
            consequence="Move trace-level evals to supported v4 evaluation workflows before the migration deadline."
            detailsHref={traceLevelEvalsHref}
          >
            {evalExecutionSeries.length ? (
              <UsageStackedBarOverview
                bucketTimes={evalExecutionBucketTimes}
                series={evalExecutionSeries}
                valueLabel="executions"
              />
            ) : (
              <ActionRow
                title={`${numberFormatter(
                  traceLevelEvalCount,
                  0,
                )} configured trace-level evals`}
                detail="No executions found in the selected range."
              />
            )}
          </AuditSection>
        ) : null}

        {isLegacyIntegrationSummaryLoading ? (
          <SectionLoading />
        ) : hasLegacyIntegrationSummaryError ? (
          <Notice>Failed to load integration data.</Notice>
        ) : legacyIntegrationLinks.length ? (
          <AuditSection
            title="Legacy exports"
            countLabel={formatCountLabel(
              legacyIntegrationLinks.length,
              "integration",
            )}
            consequence={V4_LEGACY_EXPORT_AUTO_SWITCH_COPY}
            detailsHref={`/project/${projectId}/settings/integrations`}
          >
            {legacyIntegrationLinks.map((integration) => (
              <ActionRow
                key={integration.key}
                title={integration.label}
                detail="Legacy traces and observations export is enabled."
              />
            ))}
          </AuditSection>
        ) : null}

        {!isSummaryLoading &&
        !isTimelineLoading &&
        !hasAnyError &&
        activeTaskCount === 0 ? (
          <SuccessAudit />
        ) : null}
      </div>

      <NonActionDetails
        bucketTimes={sdkUsageBucketTimes}
        sdkUsageSeries={nonActionSdkUsageSeries}
        passedChecks={passedChecks}
      />
    </DashboardCard>
  );
};
