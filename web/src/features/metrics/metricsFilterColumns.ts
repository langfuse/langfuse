import {
  type ColumnDefinition,
  type SingleValueOption,
} from "@langfuse/shared";
import { type ViewVersion, type views } from "@langfuse/shared/query";

import { type z } from "zod";

/** GetMetricsFilterColumnsParams is the option dictionary the metric filter column specs are built from. */
export type GetMetricsFilterColumnsParams = {
  selectedView: z.infer<typeof views>;
  viewVersion: ViewVersion;
  environmentOptions: SingleValueOption[];
  nameOptions: SingleValueOption[];
  observationNameOptions: SingleValueOption[];
  tagsOptions: SingleValueOption[];
  modelOptions: SingleValueOption[];
  toolNamesOptions: SingleValueOption[];
  calledToolNamesOptions: SingleValueOption[];
  observationLevelOptions: SingleValueOption[];
  experimentNameOptions: SingleValueOption[];
  experimentDatasetOptions: SingleValueOption[];
  observationTypeOptions: SingleValueOption[];
  userOptions: SingleValueOption[];
  sessionOptions: SingleValueOption[];
  versionOptions: SingleValueOption[];
  releaseOptions: SingleValueOption[];
  scoreNameOptions: SingleValueOption[];
  experimentIdOptions: SingleValueOption[];
  evaluatorOptions: SingleValueOption[];
  metadataKeyOptions: string[];
};

type MetricsFilterColumnSpec = {
  column: ColumnDefinition;
  customSelect?: boolean;
};

const getMetricsFilterColumnSpecs = ({
  selectedView,
  viewVersion,
  environmentOptions,
  nameOptions,
  observationNameOptions,
  tagsOptions,
  modelOptions,
  toolNamesOptions,
  calledToolNamesOptions,
  observationLevelOptions,
  experimentNameOptions,
  experimentDatasetOptions,
  observationTypeOptions,
  userOptions,
  sessionOptions,
  versionOptions,
  releaseOptions,
  scoreNameOptions,
  experimentIdOptions,
  evaluatorOptions,
  metadataKeyOptions,
}: GetMetricsFilterColumnsParams): MetricsFilterColumnSpec[] => {
  // Value suggestions come from the v2 events filter-options; v1 keeps manual
  // entry (plain string columns), per LFE-9570 decision to leave v1 plain.
  const suggestString = (
    name: string,
    id: string,
    options: SingleValueOption[],
    aliases?: string[],
  ): MetricsFilterColumnSpec =>
    viewVersion === "v2"
      ? {
          column: {
            name,
            id,
            type: "stringOptions",
            options,
            internal: "internalValue",
            ...(aliases ? { aliases } : {}),
          },
          customSelect: true,
        }
      : {
          column: { name, id, type: "string", internal: "internalValue" },
        };
  // v4 events hold one column per pair (e.version / e.release), so the v2
  // observations view offers a single Version / Release and the "Trace"
  // spellings of saved widgets alias onto it.
  const aliasesTraceSpelling =
    viewVersion === "v2" && selectedView === "observations";
  const metadataSuggest = viewVersion === "v2";
  const filterColumns: MetricsFilterColumnSpec[] = [
    {
      column: {
        name: "Environment",
        id: "environment",
        type: "stringOptions",
        options: environmentOptions,
        internal: "internalValue",
      },
      customSelect: true,
    },
    {
      column: {
        name: "Trace Name",
        id: "traceName",
        type: "stringOptions",
        options: nameOptions,
        internal: "internalValue",
      },
      customSelect: true,
    },
    // "Observation Name" and "Score Name" are intentionally NOT in the base
    // list because they are not valid filter columns on the traces view
    // (traces:observations and traces:scores are both 1:n -- see LFE-9773).
    // They are added below per-view where the dashboardUiTableToViewMapping
    // actually resolves them to a real dimension.
    {
      column: {
        name: "Tags",
        id: "tags",
        type: "arrayOptions",
        options: tagsOptions,
        internal: "internalValue",
      },
      customSelect: true,
    },
    suggestString("User", "user", userOptions),
    suggestString("Session", "session", sessionOptions),
    {
      column: {
        name: "Metadata",
        id: "metadata",
        type: "stringObject",
        internal: "internalValue",
        ...(metadataSuggest ? { keyOptions: metadataKeyOptions } : {}),
      },
      customSelect: metadataSuggest,
    },
    suggestString(
      "Version",
      "version",
      versionOptions,
      aliasesTraceSpelling ? ["traceVersion", "Trace Version"] : undefined,
    ),
  ];

  // v1 observationsView has no release dimension; only traceRelease.
  if (viewVersion === "v2" || selectedView !== "observations") {
    filterColumns.push(
      suggestString(
        "Release",
        "release",
        releaseOptions,
        aliasesTraceSpelling ? ["traceRelease", "Trace Release"] : undefined,
      ),
    );
  }

  if (selectedView === "observations") {
    // "Observation Name" on the observations view filters observations.name
    // (mapped through dashboardUiTableToViewMapping). "Score Name" is omitted
    // here because observations:scores is 1:n -- see LFE-9773.
    filterColumns.push(
      {
        column: {
          name: "Observation Name",
          id: "observationName",
          type: "stringOptions",
          options: observationNameOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
      {
        column: {
          name: "Evaluator",
          id: "evaluatorId",
          type: "string",
          internal: "internalValue",
          options: evaluatorOptions,
        },
        customSelect: true,
      },
      {
        column: {
          name: "Evaluator test run",
          id: "isEvaluatorTest",
          type: "boolean",
          internal: "internalValue",
        },
      },
    );
  }

  if (
    selectedView === "scores-numeric" ||
    selectedView === "scores-boolean" ||
    selectedView === "scores-categorical"
  ) {
    filterColumns.push(
      suggestString("Score Name", "scoreName", scoreNameOptions),
      {
        column: {
          name: "Observation Name",
          id: "observationName",
          type: "stringOptions",
          options: observationNameOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
      {
        column: {
          name: "Evaluator",
          id: "evaluatorId",
          type: "string",
          internal: "internalValue",
          options: evaluatorOptions,
        },
        customSelect: true,
      },
      {
        column: {
          name: "Evaluator test run",
          id: "isEvaluatorTest",
          type: "boolean",
          internal: "internalValue",
        },
      },
    );
  }

  if (selectedView === "observations") {
    filterColumns.push(
      // v2-only filter columns (experiment data only exists in events table)
      ...(viewVersion === "v2"
        ? [
            {
              column: {
                name: "Experiment Name",
                id: "experimentName",
                type: "stringOptions",
                options: experimentNameOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies MetricsFilterColumnSpec,
            {
              column: {
                name: "Experiment Dataset",
                id: "experimentDatasetId",
                type: "stringOptions",
                options: experimentDatasetOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies MetricsFilterColumnSpec,
            {
              column: {
                name: "Experiment ID",
                id: "experimentId",
                type: "stringOptions",
                options: experimentIdOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies MetricsFilterColumnSpec,
            {
              column: {
                name: "Is Root Observation",
                id: "isRootObservation",
                type: "boolean",
                internal: "internalValue",
              },
            } satisfies MetricsFilterColumnSpec,
          ]
        : []),
      {
        column: {
          name: "Tool Names (Available)",
          id: "toolNames",
          type: "arrayOptions",
          options: toolNamesOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
      {
        column: {
          name: "Tool Names (Called)",
          id: "calledToolNames",
          type: "arrayOptions",
          options: calledToolNamesOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
      // v1 joins traces for these; v4 has no separate trace-level pair.
      ...(viewVersion === "v1"
        ? [
            suggestString("Trace Release", "traceRelease", []),
            suggestString("Trace Version", "traceVersion", []),
          ]
        : []),
      {
        column: {
          name: "Model",
          id: "providedModelName",
          type: "stringOptions",
          options: modelOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
      {
        column: {
          name: "Status",
          id: "level",
          type: "stringOptions",
          options: observationLevelOptions,
          internal: "internalValue",
          aliases: ["Level"],
        },
      },
      {
        column: {
          name: "Type",
          id: "type",
          type: "stringOptions",
          options: observationTypeOptions,
          internal: "internalValue",
        },
      },
    );
  }

  if (selectedView === "scores-categorical") {
    filterColumns.push({
      column: {
        name: "Score String Value",
        id: "stringValue",
        type: "string",
        internal: "internalValue",
      },
    });
  }

  if (selectedView === "scores-numeric") {
    filterColumns.push({
      column: {
        name: "Score Value",
        id: "value",
        type: "number",
        internal: "internalValue",
      },
    });
  }

  if (selectedView === "scores-boolean") {
    filterColumns.push({
      column: {
        name: "Boolean Value",
        id: "booleanValue",
        type: "boolean",
        internal: "internalValue",
      },
    });
  }

  return filterColumns;
};

/** getMetricsFilterColumns builds the InlineFilterBuilder column definitions for a metric view. */
export const getMetricsFilterColumns = (
  params: GetMetricsFilterColumnsParams,
): ColumnDefinition[] =>
  getMetricsFilterColumnSpecs(params).map((spec) => spec.column);

/** getMetricsColumnsWithCustomSelect lists the column ids that render a custom (searchable) select control. */
export const getMetricsColumnsWithCustomSelect = (
  params: GetMetricsFilterColumnsParams,
): string[] =>
  getMetricsFilterColumnSpecs(params)
    .filter((spec) => spec.customSelect)
    .map((spec) => spec.column.id);
