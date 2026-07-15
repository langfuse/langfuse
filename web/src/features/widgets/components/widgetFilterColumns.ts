import {
  type ColumnDefinition,
  type SingleValueOption,
} from "@langfuse/shared";
import { type ViewVersion, type views } from "@langfuse/shared/query";

import { type z } from "zod";

type GetWidgetFilterColumnsParams = {
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
  traceReleaseOptions: SingleValueOption[];
  traceVersionOptions: SingleValueOption[];
  scoreNameOptions: SingleValueOption[];
  experimentIdOptions: SingleValueOption[];
  metadataKeyOptions: string[];
};

type WidgetFilterColumnSpec = {
  column: ColumnDefinition;
  customSelect?: boolean;
};

const getWidgetFilterColumnSpecs = ({
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
  traceReleaseOptions,
  traceVersionOptions,
  scoreNameOptions,
  experimentIdOptions,
  metadataKeyOptions,
}: GetWidgetFilterColumnsParams): WidgetFilterColumnSpec[] => {
  // Value suggestions come from the v2 events filter-options; v1 keeps manual
  // entry (plain string columns), per LFE-9570 decision to leave v1 plain.
  const suggestString = (
    name: string,
    id: string,
    options: SingleValueOption[],
  ): WidgetFilterColumnSpec =>
    viewVersion === "v2"
      ? {
          column: {
            name,
            id,
            type: "stringOptions",
            options,
            internal: "internalValue",
          },
          customSelect: true,
        }
      : {
          column: { name, id, type: "string", internal: "internalValue" },
        };
  const metadataSuggest = viewVersion === "v2";
  const filterColumns: WidgetFilterColumnSpec[] = [
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
    suggestString("Version", "version", versionOptions),
  ];

  if (selectedView !== "observations") {
    filterColumns.push(suggestString("Release", "release", releaseOptions));
  }

  if (selectedView === "observations") {
    // "Observation Name" on the observations view filters observations.name
    // (mapped through dashboardUiTableToViewMapping). "Score Name" is omitted
    // here because observations:scores is 1:n -- see LFE-9773.
    filterColumns.push({
      column: {
        name: "Observation Name",
        id: "observationName",
        type: "stringOptions",
        options: observationNameOptions,
        internal: "internalValue",
      },
      customSelect: true,
    });
  }

  if (
    selectedView === "scores-numeric" ||
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
    );
  }

  if (selectedView === "observations") {
    filterColumns.push(
      // v2-only filter columns (experiment data only exists in events table)
      ...(viewVersion === "v2"
        ? [
            {
              column: {
                name: "Observation Release",
                id: "release",
                type: "stringOptions",
                options: releaseOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies WidgetFilterColumnSpec,
            {
              column: {
                name: "Experiment Name",
                id: "experimentName",
                type: "stringOptions",
                options: experimentNameOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies WidgetFilterColumnSpec,
            {
              column: {
                name: "Experiment Dataset",
                id: "experimentDatasetId",
                type: "stringOptions",
                options: experimentDatasetOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies WidgetFilterColumnSpec,
            {
              column: {
                name: "Experiment ID",
                id: "experimentId",
                type: "stringOptions",
                options: experimentIdOptions,
                internal: "internalValue",
              },
              customSelect: true,
            } satisfies WidgetFilterColumnSpec,
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
      {
        column: {
          name: "Trace Release",
          id: "traceRelease",
          type: "stringOptions",
          options: traceReleaseOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
      {
        column: {
          name: "Trace Version",
          id: "traceVersion",
          type: "stringOptions",
          options: traceVersionOptions,
          internal: "internalValue",
        },
        customSelect: true,
      },
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
          name: "Level",
          id: "level",
          type: "stringOptions",
          options: observationLevelOptions,
          internal: "internalValue",
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

  return filterColumns;
};

export const getWidgetFilterColumns = (
  params: GetWidgetFilterColumnsParams,
): ColumnDefinition[] =>
  getWidgetFilterColumnSpecs(params).map((spec) => spec.column);

export const getWidgetColumnsWithCustomSelect = (
  params: GetWidgetFilterColumnsParams,
): string[] =>
  getWidgetFilterColumnSpecs(params)
    .filter((spec) => spec.customSelect)
    .map((spec) => spec.column.id);
