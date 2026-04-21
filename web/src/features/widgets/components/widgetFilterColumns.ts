import {
  type ColumnDefinition,
  type SingleValueOption,
} from "@langfuse/shared";
import { type views } from "@/src/features/query/types";
import { type z } from "zod";

type GetWidgetFilterColumnsParams = {
  selectedView: z.infer<typeof views>;
  environmentOptions: SingleValueOption[];
  nameOptions: SingleValueOption[];
  tagsOptions: SingleValueOption[];
  modelOptions: SingleValueOption[];
  toolNamesOptions: SingleValueOption[];
  calledToolNamesOptions: SingleValueOption[];
  observationLevelOptions: SingleValueOption[];
};

export const getWidgetFilterColumns = ({
  selectedView,
  environmentOptions,
  nameOptions,
  tagsOptions,
  modelOptions,
  toolNamesOptions,
  calledToolNamesOptions,
  observationLevelOptions,
}: GetWidgetFilterColumnsParams): ColumnDefinition[] => {
  const filterColumns: ColumnDefinition[] = [
    {
      name: "Environment",
      id: "environment",
      type: "stringOptions",
      options: environmentOptions,
      internal: "internalValue",
    },
    {
      name: "Trace Name",
      id: "traceName",
      type: "stringOptions",
      options: nameOptions,
      internal: "internalValue",
    },
    {
      name: "Observation Name",
      id: "observationName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Score Name",
      id: "scoreName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      options: tagsOptions,
      internal: "internalValue",
    },
    {
      name: "Tool Names (Available)",
      id: "toolNames",
      type: "arrayOptions",
      options: toolNamesOptions,
      internal: "internalValue",
    },
    {
      name: "Tool Names (Called)",
      id: "calledToolNames",
      type: "arrayOptions",
      options: calledToolNamesOptions,
      internal: "internalValue",
    },
    {
      name: "User",
      id: "user",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Session",
      id: "session",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Metadata",
      id: "metadata",
      type: "stringObject",
      internal: "internalValue",
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: "internalValue",
    },
  ];

  if (selectedView === "observations") {
    filterColumns.push({
      name: "Model",
      id: "providedModelName",
      type: "stringOptions",
      options: modelOptions,
      internal: "internalValue",
    });
    filterColumns.push({
      name: "Level",
      id: "level",
      type: "stringOptions",
      options: observationLevelOptions,
      internal: "internalValue",
    });
  }

  if (selectedView === "scores-categorical") {
    filterColumns.push({
      name: "Score String Value",
      id: "stringValue",
      type: "string",
      internal: "internalValue",
    });
  }

  if (selectedView === "scores-numeric") {
    filterColumns.push({
      name: "Score Value",
      id: "value",
      type: "number",
      internal: "internalValue",
    });
  }

  return filterColumns;
};
