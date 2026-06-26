import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { Chart } from "@/src/features/widgets/chart-library/Chart";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { numberFormatter } from "@/src/utils/numbers";

export type V4LegacyIntegrations = {
  posthog: boolean;
  mixpanel: boolean;
  blobStorage: boolean;
};

export type V4MigrationSummary = {
  traceLevelEvalCount: number;
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

export const PUBLIC_API_DOCS = [
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

const CardError = ({ children }: { children: string }) => (
  <div className="border-destructive/30 bg-destructive/10 text-destructive flex min-h-28 items-center rounded-md border p-4 text-sm">
    {children}
  </div>
);

export const ProductLinkButton = ({
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

export const V4MigrationProjectCards = ({
  projectId,
  summary,
  legacyApiUsage,
  traceLevelEvalExecutions,
  isSummaryLoading,
  isLegacyApiUsageLoading,
  isTraceLevelEvalExecutionsLoading,
  hasSummaryError,
  hasLegacyApiUsageError,
  hasTraceLevelEvalExecutionsError,
}: {
  projectId: string;
  summary: V4MigrationSummary | undefined;
  legacyApiUsage: V4LegacyApiUsagePoint[] | undefined;
  traceLevelEvalExecutions: V4TraceLevelEvalExecutionPoint[] | undefined;
  isSummaryLoading: boolean;
  isLegacyApiUsageLoading: boolean;
  isTraceLevelEvalExecutionsLoading: boolean;
  hasSummaryError: boolean;
  hasLegacyApiUsageError: boolean;
  hasTraceLevelEvalExecutionsError: boolean;
}) => {
  const traceLevelEvalsHref = useMemo(
    () => getTraceLevelEvalsHref(projectId),
    [projectId],
  );

  const legacyIntegrationLinks = useMemo(
    () =>
      INTEGRATION_LINKS.filter(
        (link) => summary?.legacyIntegrations[link.key] === true,
      ).map((link) => ({
        ...link,
        href: `/project/${projectId}/settings/integrations/${link.path}`,
      })),
    [projectId, summary?.legacyIntegrations],
  );

  const integrationsHref = `/project/${projectId}/settings/integrations`;

  const chartData = useMemo(
    () =>
      legacyApiUsage?.map((row) => ({
        time_dimension: row.time,
        dimension: row.entrypoint,
        metric: row.count,
      })) ?? [],
    [legacyApiUsage],
  );

  const evalExecutionChartData = useMemo(
    () =>
      traceLevelEvalExecutions?.map((row) => ({
        time_dimension: row.time,
        dimension: row.scoreName,
        metric: row.count,
      })) ?? [],
    [traceLevelEvalExecutions],
  );

  return (
    <>
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <DashboardCard
          title="Trace-level evals"
          description="Trace-targeting evaluator configs and non-cancelled execution jobs by generated score name."
          isLoading={isSummaryLoading || isTraceLevelEvalExecutionsLoading}
          cardContentClassName="min-h-[30rem]"
          headerClassName="pr-12"
          headerRight={
            <ProductLinkButton href={traceLevelEvalsHref}>
              View evals
            </ProductLinkButton>
          }
        >
          <div className="flex flex-col gap-4">
            {hasSummaryError ? (
              <CardError>Failed to load trace-level evals.</CardError>
            ) : (
              <div>
                <p className="text-muted-foreground text-sm">
                  Configured trace-level evals
                </p>
                <div className="text-4xl font-semibold">
                  {numberFormatter(summary?.traceLevelEvalCount ?? 0, 0)}
                </div>
              </div>
            )}

            {hasTraceLevelEvalExecutionsError ? (
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
                isLoading={isTraceLevelEvalExecutionsLoading}
                description="No trace-level eval executions were found for this project in the selected time range."
                className="min-h-[22rem]"
              />
            )}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Integrations"
          description="PostHog, Mixpanel, and Blob Storage exports that need review for V4."
          isLoading={isSummaryLoading}
        >
          {hasSummaryError ? (
            <CardError>Failed to load integrations.</CardError>
          ) : (
            <div className="flex min-h-32 flex-col gap-4">
              <div>
                <p className="text-muted-foreground text-sm">
                  Configured integrations to review
                </p>
                <div className="text-4xl font-semibold">
                  {numberFormatter(summary?.legacyIntegrationCount ?? 0, 0)}
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
        isLoading={isLegacyApiUsageLoading}
        cardContentClassName="min-h-[32rem]"
        headerClassName="pr-12"
      >
        {hasLegacyApiUsageError ? (
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
                isLoading={isLegacyApiUsageLoading}
                description="No ClickHouse-backed public API usage was found for this project in the selected time range."
                className="min-h-[30rem]"
              />
            )}
          </>
        )}
      </DashboardCard>
    </>
  );
};
