import { useMemo } from "react";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { TimeRangePicker } from "@/src/components/date-picker";
import {
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  toAbsoluteTimeRange,
  type AbsoluteTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import { api } from "@/src/utils/api";
import { V4MigrationProjectCards } from "@/src/features/v4/components/V4MigrationProjectCards";

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
        <V4MigrationProjectCards
          projectId={projectId ?? ""}
          summary={summary.data}
          legacyApiUsage={legacyApiUsage.data}
          traceLevelEvalExecutions={traceLevelEvalExecutions.data}
          isSummaryLoading={summary.isPending}
          isLegacyApiUsageLoading={legacyApiUsage.isPending}
          isTraceLevelEvalExecutionsLoading={traceLevelEvalExecutions.isPending}
          hasSummaryError={Boolean(summary.error)}
          hasLegacyApiUsageError={Boolean(legacyApiUsage.error)}
          hasTraceLevelEvalExecutionsError={Boolean(
            traceLevelEvalExecutions.error,
          )}
        />
      </div>
    </Page>
  );
}
