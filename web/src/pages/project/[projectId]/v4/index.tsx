import { useMemo } from "react";
import { useRouter } from "next/router";
import { ExternalLink } from "lucide-react";
import Page from "@/src/components/layouts/page";
import { TimeRangePicker } from "@/src/components/date-picker";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  getOptimalInterval,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { api } from "@/src/utils/api";

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

  const chartData = useMemo(
    () =>
      legacyApiUsage.data?.map((row) => ({
        time_dimension: row.time,
        dimension: row.entrypoint,
        metric: row.count,
      })) ?? [],
    [legacyApiUsage.data],
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
          <h4 className="text-base font-semibold">legacy api usage</h4>
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

        <DashboardCard
          title="Legacy API usage by entrypoint over time"
          description="Counts ClickHouse-backed legacy public API reads for this project."
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
