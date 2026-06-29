import { useMemo } from "react";
import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { TimeRangePicker } from "@/src/components/date-picker";
import { DEFAULT_DASHBOARD_AGGREGATION_SELECTION } from "@/src/utils/date-range-utils";
import { useGlobalDateRange } from "@/src/features/global-time-range/useGlobalDateRange";
import { api } from "@/src/utils/api";
import { V4MigrationProjectCards } from "@/src/features/v4/components/V4MigrationProjectCards";
import {
  getCappedAbsoluteTimeRange,
  MAX_V4_TIMELINE_RANGE_MS,
  V4_TIME_RANGE_PRESETS,
} from "@/src/features/v4/utils";

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

  const traceLevelEvalSummary = api.v4Transition.traceLevelEvalSummary.useQuery(
    {
      projectId: projectId ?? "",
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
        trpc: {
          context: {
            skipBatch: true,
          },
        },
      },
    );

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Migrate to v4",
        breadcrumb: [{ name: "Home", href: `/project/${projectId}` }],
        actionButtonsLeft: (
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={V4_TIME_RANGE_PRESETS}
            disabled={{ before: earliestSelectableDate }}
            maxRangeMs={MAX_V4_TIMELINE_RANGE_MS}
            className="my-0 max-w-full overflow-x-auto"
          />
        ),
      }}
    >
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-3">
        <V4MigrationProjectCards
          projectId={projectId ?? ""}
          legacyIntegrationSummary={summary.data}
          traceLevelEvalCount={traceLevelEvalSummary.data?.traceLevelEvalCount}
          legacyApiUsage={legacyApiUsage.data}
          traceLevelEvalExecutions={traceLevelEvalExecutions.data}
          isLegacyIntegrationSummaryLoading={summary.isPending}
          isTraceLevelEvalSummaryLoading={traceLevelEvalSummary.isPending}
          isLegacyApiUsageLoading={legacyApiUsage.isPending}
          isTraceLevelEvalExecutionsLoading={traceLevelEvalExecutions.isPending}
          hasLegacyIntegrationSummaryError={Boolean(summary.error)}
          hasTraceLevelEvalSummaryError={Boolean(traceLevelEvalSummary.error)}
          hasLegacyApiUsageError={Boolean(legacyApiUsage.error)}
          hasTraceLevelEvalExecutionsError={Boolean(
            traceLevelEvalExecutions.error,
          )}
        />
      </div>
    </Page>
  );
}
