import { useMemo } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import Page from "@/src/components/layouts/page";
import { TimeRangePicker } from "@/src/components/date-picker";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { Button } from "@/src/components/ui/button";
import {
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  toAbsoluteTimeRange,
  type AbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import { api } from "@/src/utils/api";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { numberFormatter } from "@/src/utils/numbers";

const V4_TIME_RANGE_PRESETS = [
  "last5Minutes",
  "last30Minutes",
  "last1Hour",
  "last3Hours",
  "last1Day",
  "last7Days",
  "last30Days",
] as const;

const MAX_V4_TIMELINE_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

const getCappedAbsoluteTimeRange = (
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

const PUBLIC_API_DOCS = [
  {
    label: "V4 upgrade guide",
    href: "https://langfuse.com/docs/v4",
  },
  {
    label: "Observations API v2",
    href: "https://langfuse.com/docs/api-and-data-platform/features/observations-api#v2",
  },
  {
    label: "Metrics API v2",
    href: "https://langfuse.com/docs/metrics/features/metrics-api#v2",
  },
] as const;

const INTEGRATION_LINKS = [
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
] as const;

const CardError = ({ children }: { children: string }) => (
  <div className="border-destructive/30 bg-destructive/10 text-destructive flex min-h-28 items-center rounded-md border p-4 text-sm">
    {children}
  </div>
);

const ProductLinkButton = ({
  href,
  children,
}: {
  href: string | { pathname: string; query: Record<string, string> };
  children: ReactNode;
}) => (
  <Button asChild variant="outline" size="sm">
    <Link href={href}>
      {children}
      <ArrowRight className="ml-1 h-3.5 w-3.5" />
    </Link>
  </Button>
);

const ExternalDocButton = ({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) => (
  <Button asChild variant="outline" size="sm">
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink className="ml-1 h-3.5 w-3.5" />
    </a>
  </Button>
);

export default function V4Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { timeRange, setTimeRange } = useGlobalDateRange({
    allowedRanges: V4_TIME_RANGE_PRESETS,
    fallback: DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  });

  const absoluteTimeRange = useMemo(() => {
    return getCappedAbsoluteTimeRange(timeRange);
  }, [timeRange]);

  const earliestSelectableDate = useMemo(
    () => new Date(Date.now() - MAX_V4_TIMELINE_RANGE_MS),
    [],
  );

  const legacyApiUsage = api.v4Transition.timeSeriesByEntrypoint.useQuery(
    {
      projectId: projectId ?? "",
      fromTimestamp: absoluteTimeRange.from,
      toTimestamp: absoluteTimeRange.to,
      granularity: "auto",
    },
    {
      enabled: Boolean(projectId),
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );

  const summary = api.v4Transition.summary.useQuery(
    {
      projectId: projectId ?? "",
    },
    {
      enabled: Boolean(projectId),
    },
  );

  const traceLevelEvalExecutions =
    api.v4Transition.traceLevelEvalExecutionsTimeSeries.useQuery(
      {
        projectId: projectId ?? "",
        fromTimestamp: absoluteTimeRange.from,
        toTimestamp: absoluteTimeRange.to,
        granularity: "auto",
      },
      {
        enabled: Boolean(projectId),
      },
    );

  const traceLevelEvalsHref = useMemo(
    () => ({
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
    }),
    [projectId],
  );

  const legacyIntegrationLinks = useMemo(
    () =>
      INTEGRATION_LINKS.filter(
        (link) =>
          summary.data?.legacyIntegrations[link.key] === true &&
          Boolean(projectId),
      ).map((link) => ({
        ...link,
        href: `/project/${projectId}/settings/integrations/${link.path}`,
      })),
    [projectId, summary.data?.legacyIntegrations],
  );

  const integrationsHref = `/project/${projectId}/settings/integrations`;

  const chartData = useMemo(
    () =>
      legacyApiUsage.data?.map((row) => ({
        time_dimension: row.time,
        dimension: row.entrypoint,
        metric: row.count,
      })) ?? [],
    [legacyApiUsage.data],
  );

  const evalExecutionChartData = useMemo(
    () =>
      traceLevelEvalExecutions.data?.map((row) => ({
        time_dimension: row.time,
        dimension: row.scoreName,
        metric: row.count,
      })) ?? [],
    [traceLevelEvalExecutions.data],
  );

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "V4",
        breadcrumb: [{ name: "Home", href: `/project/${projectId}` }],
        actionButtonsLeft: (
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={V4_TIME_RANGE_PRESETS}
            disabled={{ before: earliestSelectableDate }}
            className="my-0 max-w-full overflow-x-auto"
          />
        ),
      }}
    >
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-3">
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <DashboardCard
            title="Trace-level evals"
            description="Trace-targeting evaluator configs and non-cancelled execution jobs by generated score name."
            isLoading={summary.isPending || traceLevelEvalExecutions.isPending}
            cardContentClassName="min-h-[30rem]"
            headerClassName="pr-12"
            headerRight={
              <ProductLinkButton href={traceLevelEvalsHref}>
                View evals
              </ProductLinkButton>
            }
          >
            <div className="flex flex-col gap-4">
              {summary.error ? (
                <CardError>Failed to load trace-level evals.</CardError>
              ) : (
                <div>
                  <p className="text-muted-foreground text-sm">
                    Configured trace-level evals
                  </p>
                  <div className="text-4xl font-semibold">
                    {numberFormatter(summary.data?.traceLevelEvalCount ?? 0, 0)}
                  </div>
                </div>
              )}

              {traceLevelEvalExecutions.error ? (
                <CardError>
                  Failed to load trace-level eval executions.
                </CardError>
              ) : evalExecutionChartData.length > 0 ? (
                <div className="h-[22rem] w-full">
                  <Chart
                    chartType="BAR_TIME_SERIES"
                    data={evalExecutionChartData}
                    rowLimit={1_000}
                    chartConfig={{
                      type: "BAR_TIME_SERIES",
                      unit: "short",
                    }}
                    overrideWarning
                  />
                </div>
              ) : (
                <NoDataOrLoading
                  isLoading={traceLevelEvalExecutions.isPending}
                  description="No trace-level eval executions were found for this project in the selected time range."
                  className="min-h-[22rem]"
                />
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Integrations"
            description="PostHog, Mixpanel, and Blob Storage exports that need review for V4."
            isLoading={summary.isPending}
          >
            {summary.error ? (
              <CardError>Failed to load integrations.</CardError>
            ) : (
              <div className="flex min-h-32 flex-col gap-4">
                <div>
                  <p className="text-muted-foreground text-sm">
                    Configured integrations to review
                  </p>
                  <div className="text-4xl font-semibold">
                    {numberFormatter(
                      summary.data?.legacyIntegrationCount ?? 0,
                      0,
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ProductLinkButton href={integrationsHref}>
                    View integrations
                  </ProductLinkButton>
                  {legacyIntegrationLinks.length > 0
                    ? legacyIntegrationLinks.map((link) => (
                        <ProductLinkButton key={link.key} href={link.href}>
                          {link.label}
                        </ProductLinkButton>
                      ))
                    : null}
                </div>
              </div>
            )}
          </DashboardCard>
        </div>

        <DashboardCard
          title="Public API calls to review"
          description="ClickHouse-backed public API calls that may need changes for V4."
          isLoading={legacyApiUsage.isPending}
          cardContentClassName="min-h-[32rem]"
          headerClassName="pr-12"
        >
          {legacyApiUsage.error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive flex min-h-36 items-center rounded-md border p-4 text-sm">
              Failed to load public API usage.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {PUBLIC_API_DOCS.map((doc) => (
                  <ExternalDocButton key={doc.href} href={doc.href}>
                    {doc.label}
                  </ExternalDocButton>
                ))}
              </div>
              <p className="text-muted-foreground text-sm">
                We do not have query-log data for GET /api/public/sessions.
              </p>

              {chartData.length > 0 ? (
                <div className="h-[30rem] w-full">
                  <Chart
                    chartType="BAR_TIME_SERIES"
                    data={chartData}
                    rowLimit={1_000}
                    chartConfig={{
                      type: "BAR_TIME_SERIES",
                      unit: "short",
                    }}
                    overrideWarning
                  />
                </div>
              ) : (
                <NoDataOrLoading
                  isLoading={legacyApiUsage.isPending}
                  description="No ClickHouse-backed public API usage was found for this project in the selected time range."
                  className="min-h-[30rem]"
                />
              )}
            </>
          )}
        </DashboardCard>
      </div>
    </Page>
  );
}
