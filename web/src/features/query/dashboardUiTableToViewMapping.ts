import { z } from "zod";
import { singleFilter } from "@langfuse/shared";
import { type views } from "@/src/features/query/types";

// Exported to silence @typescript-eslint/no-unused-vars v8 warning
// (used for type extraction via typeof, which is a legitimate pattern)
export const FilterArray = z.array(singleFilter);

/**
 * Central compatibility layer for dashboard/widget filter columns.
 *
 * Legacy dashboard filters can arrive in three shapes:
 * - uiTableName display labels from the old dashboard filter bar, e.g. "Model"
 * - uiTableId values from ad hoc callers, e.g. "model"
 * - explicit legacy aliases, e.g. "Tool Names"
 *
 * The query engine expects canonical view field names instead, e.g.
 * "providedModelName" or "toolNames". Widgets also need the inverse mapping
 * when reopening saved filters in the editor so persisted query fields render
 * with the current user-facing labels again.
 *
 * Keep all dashboard/widget filter migration and fallback logic in this module.
 * If a new legacy dashboard column shape needs to remain supported, add it to
 * this mapping rather than patching individual router or widget code paths.
 */
type DashboardViewFilterMapping = {
  uiTableName: string;
  uiTableId?: string;
  aliases?: readonly string[];
  viewName: string;
};

type ViewName = z.infer<typeof views>;

type DashboardFilterSourceSpec = Omit<DashboardViewFilterMapping, "viewName">;

type DashboardViewFieldDefinition = {
  viewName: string;
  current: DashboardFilterSourceSpec;
  legacy?: DashboardFilterSourceSpec;
};

const sourceSpec = (
  uiTableName: string,
  options: Omit<DashboardFilterSourceSpec, "uiTableName"> = {},
): DashboardFilterSourceSpec => ({
  uiTableName,
  ...options,
});

const defineField = (
  viewName: string,
  current: DashboardFilterSourceSpec,
  legacy?: DashboardFilterSourceSpec,
): DashboardViewFieldDefinition => ({
  viewName,
  current,
  legacy,
});

const viewFilterDefinitions: Record<
  ViewName,
  readonly DashboardViewFieldDefinition[]
> = {
  traces: [
    defineField("name", sourceSpec("Trace Name", { uiTableId: "traceName" })),
    defineField(
      "observationName",
      sourceSpec("Observation Name", { uiTableId: "observationName" }),
    ),
    defineField(
      "scoreName",
      sourceSpec("Score Name", { uiTableId: "scoreName" }),
    ),
    defineField("tags", sourceSpec("Tags", { uiTableId: "traceTags" })),
    defineField(
      "userId",
      sourceSpec("User", { uiTableId: "user" }),
      sourceSpec("User", { uiTableId: "userId" }),
    ),
    defineField(
      "sessionId",
      sourceSpec("Session", { uiTableId: "session" }),
      sourceSpec("Session", { uiTableId: "sessionId" }),
    ),
    defineField("metadata", sourceSpec("Metadata", { uiTableId: "metadata" })),
    defineField("release", sourceSpec("Release", { uiTableId: "release" })),
    defineField("version", sourceSpec("Version", { uiTableId: "version" })),
    defineField(
      "environment",
      sourceSpec("Environment", { uiTableId: "environment" }),
    ),
  ],
  observations: [
    defineField(
      "traceName",
      sourceSpec("Trace Name", { uiTableId: "traceName" }),
    ),
    defineField(
      "name",
      sourceSpec("Observation Name", { uiTableId: "observationName" }),
    ),
    defineField(
      "scoreName",
      sourceSpec("Score Name", { uiTableId: "scoreName" }),
    ),
    defineField(
      "userId",
      sourceSpec("User", { uiTableId: "user" }),
      sourceSpec("User", { uiTableId: "userId" }),
    ),
    defineField(
      "sessionId",
      sourceSpec("Session", { uiTableId: "session" }),
      sourceSpec("Session", { uiTableId: "sessionId" }),
    ),
    defineField("metadata", sourceSpec("Metadata", { uiTableId: "metadata" })),
    defineField("type", sourceSpec("Type", { uiTableId: "type" })),
    defineField("tags", sourceSpec("Tags", { uiTableId: "traceTags" })),
    defineField(
      "providedModelName",
      sourceSpec("Model", { uiTableId: "model" }),
    ),
    defineField("level", sourceSpec("Level", { uiTableId: "level" })),
    defineField(
      "toolNames",
      sourceSpec("Tool Names (Available)", { uiTableId: "toolNames" }),
      sourceSpec("Tool Names (Available)", {
        uiTableId: "toolNames",
        aliases: ["Tool Names"],
      }),
    ),
    defineField(
      "calledToolNames",
      sourceSpec("Tool Names (Called)", { uiTableId: "calledToolNames" }),
    ),
    defineField(
      "traceRelease",
      sourceSpec("Trace Release", { uiTableId: "traceRelease" }),
      sourceSpec("Release"),
    ),
    defineField(
      "traceVersion",
      sourceSpec("Trace Version", { uiTableId: "traceVersion" }),
      sourceSpec("Version"),
    ),
    defineField(
      "environment",
      sourceSpec("Environment", { uiTableId: "environment" }),
    ),
    defineField(
      "release",
      sourceSpec("Observation Release", { uiTableId: "release" }),
    ),
    defineField("version", sourceSpec("Version", { uiTableId: "version" })),
  ],
  "scores-numeric": [
    defineField("name", sourceSpec("Score Name", { uiTableId: "scoreName" })),
    defineField(
      "source",
      sourceSpec("Score Source", { uiTableId: "scoreSource" }),
    ),
    defineField(
      "value",
      sourceSpec("Score Value", {
        uiTableId: "value",
        aliases: ["value"],
      }),
    ),
    defineField(
      "dataType",
      sourceSpec("Scores Data Type", { uiTableId: "scoreDataType" }),
    ),
    defineField("tags", sourceSpec("Tags", { uiTableId: "traceTags" })),
    defineField(
      "environment",
      sourceSpec("Environment", { uiTableId: "environment" }),
    ),
    defineField(
      "userId",
      sourceSpec("User", { uiTableId: "user" }),
      sourceSpec("User", { uiTableId: "userId" }),
    ),
    defineField(
      "sessionId",
      sourceSpec("Session", { uiTableId: "session" }),
      sourceSpec("Session", { uiTableId: "sessionId" }),
    ),
    defineField("metadata", sourceSpec("Metadata", { uiTableId: "metadata" })),
    defineField(
      "traceName",
      sourceSpec("Trace Name", { uiTableId: "traceName" }),
    ),
    defineField(
      "observationName",
      sourceSpec("Observation Name", { uiTableId: "observationName" }),
    ),
    defineField(
      "traceRelease",
      sourceSpec("Release", { uiTableId: "release" }),
    ),
    defineField(
      "traceVersion",
      sourceSpec("Version", { uiTableId: "version" }),
    ),
  ],
  "scores-categorical": [
    defineField("name", sourceSpec("Score Name", { uiTableId: "scoreName" })),
    defineField(
      "source",
      sourceSpec("Score Source", { uiTableId: "scoreSource" }),
    ),
    defineField(
      "stringValue",
      sourceSpec("Score String Value", { uiTableId: "stringValue" }),
    ),
    defineField(
      "dataType",
      sourceSpec("Scores Data Type", { uiTableId: "scoreDataType" }),
    ),
    defineField("tags", sourceSpec("Tags", { uiTableId: "traceTags" })),
    defineField(
      "environment",
      sourceSpec("Environment", { uiTableId: "environment" }),
    ),
    defineField(
      "userId",
      sourceSpec("User", { uiTableId: "user" }),
      sourceSpec("User", { uiTableId: "userId" }),
    ),
    defineField(
      "sessionId",
      sourceSpec("Session", { uiTableId: "session" }),
      sourceSpec("Session", { uiTableId: "sessionId" }),
    ),
    defineField("metadata", sourceSpec("Metadata", { uiTableId: "metadata" })),
    defineField(
      "traceName",
      sourceSpec("Trace Name", { uiTableId: "traceName" }),
    ),
    defineField(
      "observationName",
      sourceSpec("Observation Name", { uiTableId: "observationName" }),
    ),
    defineField(
      "traceRelease",
      sourceSpec("Release", { uiTableId: "release" }),
    ),
    defineField(
      "traceVersion",
      sourceSpec("Version", { uiTableId: "version" }),
    ),
  ],
};

const buildFilterMappings = (
  source: "current" | "legacy",
): Record<ViewName, readonly DashboardViewFilterMapping[]> =>
  (Object.keys(viewFilterDefinitions) as ViewName[]).reduce<
    Record<ViewName, readonly DashboardViewFilterMapping[]>
  >(
    (acc, view) => {
      acc[view] = viewFilterDefinitions[view].map((field) => ({
        ...(source === "legacy"
          ? (field.legacy ?? field.current)
          : field.current),
        viewName: field.viewName,
      }));

      return acc;
    },
    {} as Record<ViewName, readonly DashboardViewFilterMapping[]>,
  );

const currentWidgetFilterMappings = buildFilterMappings("current");
const legacyDashboardFilterMappings = buildFilterMappings("legacy");

const allWidgetFilterMappings = [
  ...Object.values(currentWidgetFilterMappings).flat(),
  ...Object.values(legacyDashboardFilterMappings).flat(),
];

const matchesFilterMapping = (
  mapping: DashboardViewFilterMapping,
  column: string | undefined,
): boolean => {
  if (column === undefined) {
    return false;
  }

  return (
    mapping.uiTableName === column ||
    mapping.uiTableId === column ||
    mapping.aliases?.includes(column) === true
  );
};

const findViewFilterMapping = (
  mappings: readonly DashboardViewFilterMapping[],
  column: string | undefined,
): DashboardViewFilterMapping | undefined =>
  mappings.find((mapping) => matchesFilterMapping(mapping, column));

const isCanonicalViewFilterColumn = (
  view: z.infer<typeof views>,
  column: string | undefined,
): boolean =>
  column !== undefined &&
  currentWidgetFilterMappings[view].some(
    (mapping) => mapping.viewName === column,
  );

const isKnownWidgetFilterColumn = (column: string | undefined): boolean =>
  allWidgetFilterMappings.some((mapping) =>
    matchesFilterMapping(mapping, column),
  );

type PartitionedWidgetFilters = {
  mappedFilters: z.infer<typeof FilterArray>;
  unsupportedFilters: z.infer<typeof FilterArray>;
};

const partitionUiTableFiltersToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
  source: "stored" | "editor",
): PartitionedWidgetFilters => {
  return filters.reduce<PartitionedWidgetFilters>(
    (acc, filter) => {
      if (isCanonicalViewFilterColumn(view, filter.column)) {
        acc.mappedFilters.push(filter);
        return acc;
      }

      const primaryMappings =
        source === "stored"
          ? legacyDashboardFilterMappings[view]
          : currentWidgetFilterMappings[view];
      const fallbackMappings =
        source === "stored"
          ? currentWidgetFilterMappings[view]
          : legacyDashboardFilterMappings[view];

      const definition =
        findViewFilterMapping(primaryMappings, filter.column) ??
        findViewFilterMapping(fallbackMappings, filter.column);

      if (definition) {
        acc.mappedFilters.push({ ...filter, column: definition.viewName });
        return acc;
      }

      if (isKnownWidgetFilterColumn(filter.column)) {
        acc.unsupportedFilters.push(filter);
        return acc;
      }

      acc.mappedFilters.push(filter);
      return acc;
    },
    { mappedFilters: [], unsupportedFilters: [] },
  );
};

export const partitionStoredUiTableFiltersToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): PartitionedWidgetFilters =>
  partitionUiTableFiltersToView(view, filters, "stored");

export const partitionWidgetUiTableFiltersToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): PartitionedWidgetFilters =>
  partitionUiTableFiltersToView(view, filters, "editor");

export const mapLegacyUiTableFilterToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): z.infer<typeof FilterArray> => {
  return partitionStoredUiTableFiltersToView(view, filters).mappedFilters;
};

export const mapWidgetUiTableFilterToView = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): z.infer<typeof FilterArray> => {
  return partitionWidgetUiTableFiltersToView(view, filters).mappedFilters;
};

export const normalizeStoredWidgetFiltersForEditor = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): {
  editorFilters: z.infer<typeof FilterArray>;
  unsupportedFilters: z.infer<typeof FilterArray>;
} => {
  const partitionedFilters = partitionStoredUiTableFiltersToView(view, filters);

  return {
    editorFilters: [
      ...mapViewFilterToUiTableFilter(view, partitionedFilters.mappedFilters),
      ...partitionedFilters.unsupportedFilters,
    ],
    unsupportedFilters: partitionedFilters.unsupportedFilters,
  };
};

export const mapViewFilterToUiTableFilter = (
  view: z.infer<typeof views>,
  filters: z.infer<typeof FilterArray>,
): z.infer<typeof FilterArray> => {
  return filters.map((filter) => {
    const definition = currentWidgetFilterMappings[view].find(
      (mapping) => mapping.viewName === filter.column,
    );

    return definition ? { ...filter, column: definition.uiTableName } : filter;
  });
};
