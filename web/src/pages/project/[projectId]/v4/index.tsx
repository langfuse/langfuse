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
  DASHBOARD_AGGREGATION_OPTIONS,
  getOptimalInterval,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { api } from "@/src/utils/api";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { numberFormatter } from "@/src/utils/numbers";

const UPGRADE_DOCS = [
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

export default function V4Page() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { timeRange, setTimeRange } = useDashboardDateRange();

  const absoluteTimeRange = useMemo(() => {
    return (
      toAbsoluteTimeRange(timeRange) ?? {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
        to: new Date(),
      }
    );
  }, [timeRange]);

  const interval = useMemo(
    () => getOptimalInterval(absoluteTimeRange.from, absoluteTimeRange.to),
    [absoluteTimeRange.from, absoluteTimeRange.to],
  );

  const legacyApiUsage = api.v4Transition.timeSeriesByEntrypoint.useQuery(
    {
      projectId: projectId ?? "",
      fromTimestamp: absoluteTimeRange.from,
      toTimestamp: absoluteTimeRange.to,
      interval,
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
        interval,
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
        dimension: row.status,
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
            timeRangePresets={DASHBOARD_AGGREGATION_OPTIONS}
            className="my-0 max-w-full overflow-x-auto"
          />
        ),
      }}
    >
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-3">
        <section className="flex flex-col gap-2">
          <h4 className="text-base font-semibold">V4 upgrade status</h4>
          <div className="flex flex-wrap gap-2">
            {UPGRADE_DOCS.map((doc) => (
              <a
                key={doc.href}
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-2 text-sm"
              >
                {doc.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DashboardCard
            title="Trace-level evals"
            description="Trace-targeting evaluator configs set up in this project."
            isLoading={summary.isPending}
          >
            {summary.error ? (
              <CardError>Failed to load trace-level evals.</CardError>
            ) : (
              <div className="flex h-full min-h-32 flex-col justify-between gap-4">
                <div className="text-4xl font-semibold">
                  {numberFormatter(summary.data?.traceLevelEvalCount ?? 0, 0)}
                </div>
                <ProductLinkButton href={traceLevelEvalsHref}>
                  View trace-level evals
                </ProductLinkButton>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Old integrations"
            description="Configured integrations that still use legacy trace and observation exports."
            isLoading={summary.isPending}
          >
            {summary.error ? (
              <CardError>Failed to load old integrations.</CardError>
            ) : (
              <div className="flex h-full min-h-32 flex-col justify-between gap-4">
                <div className="text-4xl font-semibold">
                  {numberFormatter(
                    summary.data?.legacyIntegrationCount ?? 0,
                    0,
                  )}
                </div>
                {legacyIntegrationLinks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {legacyIntegrationLinks.map((link) => (
                      <ProductLinkButton key={link.key} href={link.href}>
                        {link.label}
                      </ProductLinkButton>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No legacy PostHog, Mixpanel, or Blob Storage integrations
                    found.
                  </p>
                )}
              </div>
            )}
          </DashboardCard>
        </div>

        <DashboardCard
          title="Trace-level eval executions over time"
          description="Non-cancelled execution jobs for trace-level evaluators in the selected range."
          isLoading={traceLevelEvalExecutions.isPending}
          cardContentClassName="min-h-[24rem]"
          headerRight={
            <ProductLinkButton href={traceLevelEvalsHref}>
              View evals
            </ProductLinkButton>
          }
        >
          {traceLevelEvalExecutions.error ? (
            <CardError>Failed to load trace-level eval executions.</CardError>
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
        </DashboardCard>

        <section className="flex flex-col gap-2">
          <h4 className="text-base font-semibold">legacy api usage</h4>
          <p className="text-muted-foreground text-sm">
            We do not have query-log data for GET /api/public/sessions because
            that endpoint does not execute ClickHouse queries.
          </p>
        </section>

        <DashboardCard
          title="Legacy API usage by entrypoint over time"
          description="Estimates ClickHouse-backed legacy public API calls for this project."
          isLoading={legacyApiUsage.isPending}
          cardContentClassName="min-h-[32rem]"
        >
          {legacyApiUsage.error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive flex min-h-36 items-center rounded-md border p-4 text-sm">
              Failed to load legacy API usage.
            </div>
          ) : chartData.length > 0 ? (
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
              description="No ClickHouse-backed legacy public API usage was found for this project in the selected time range."
              href="https://langfuse.com/docs/v4"
              className="min-h-[30rem]"
            />
          )}
        </DashboardCard>
      </div>
    </Page>
  );
}
