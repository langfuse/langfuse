import {
  type FilterState,
  type StudioQuery,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import {
  resolveWidgetRenderVersion,
  type ViewVersion,
  viewDeclarations,
} from "@langfuse/shared/query";

export function withStudioQueries(
  config: StudioWidgetConfig,
  queries: StudioQuery[],
): StudioWidgetConfig {
  const ids = new Set(queries.map((query) => query.id));
  const activeQueryIds = config.display.activeQueryIds?.filter((id) =>
    ids.has(id),
  );
  const headlineMetricRef = config.display.headlineMetricRef;
  return {
    ...config,
    queries,
    display: {
      ...config.display,
      activeQueryIds: activeQueryIds?.length ? activeQueryIds : undefined,
      headlineMetricRef: queries.some((query) =>
        query.metrics.some(
          (metric) => `${query.id}.${metric.id}` === headlineMetricRef,
        ),
      )
        ? headlineMetricRef
        : undefined,
    },
  };
}

export function resolveStudioQueryVersion(
  config: StudioWidgetConfig,
  newestReadableVersion: ViewVersion,
  filters: FilterState,
): ViewVersion {
  return config.queries.some(
    (query) =>
      (!viewDeclarations.v1[query.view] &&
        Boolean(viewDeclarations.v2[query.view])) ||
      resolveWidgetRenderVersion({
        newestReadableVersion,
        shape: {
          view: query.view,
          dimensions: query.dimensions,
          measures: query.metrics.flatMap((metric) => [
            { measure: metric.measure },
            ...(metric.summary ? [{ measure: metric.summary.measure }] : []),
          ]),
          filters: [...query.filters, ...filters],
        },
      }) === "v2",
  )
    ? "v2"
    : "v1";
}
