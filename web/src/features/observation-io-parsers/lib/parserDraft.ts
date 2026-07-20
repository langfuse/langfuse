import {
  type FilterState,
  type ObservationIoParserSource,
  type ObservationIoParserSourceRepresentation,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";

export type ObservationIoParserConfig =
  RouterOutputs["observationIoParsers"]["list"][number];

export type ParserFieldDraft = {
  id: string;
  source: ObservationIoParserSource;
  jsonPath: string;
  display: "auto" | "json" | "markdown";
};

export type ParserDraft = {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  sourceRepresentation: ObservationIoParserSourceRepresentation;
  filters: FilterState;
  fields: ParserFieldDraft[];
};

export const newFieldDraft = (
  sourceRepresentation: ObservationIoParserSourceRepresentation = "normalized_chat",
): ParserFieldDraft => ({
  id: `${Date.now()}-${Math.random()}`,
  source:
    sourceRepresentation === "normalized_chat" ? "conversation" : "output",
  jsonPath:
    sourceRepresentation === "normalized_chat" ? "$.lastText" : "$.quality",
  display: "auto",
});

export const createDraft = (
  currentFilters: FilterState,
  priority: number,
): ParserDraft => ({
  name: "",
  description: "",
  enabled: true,
  priority,
  sourceRepresentation: "normalized_chat",
  filters: currentFilters,
  fields: [newFieldDraft("normalized_chat")],
});

export const draftFromConfig = (
  config: ObservationIoParserConfig,
): ParserDraft => ({
  id: config.id,
  name: config.name,
  description: config.description ?? "",
  enabled: config.enabled,
  priority: config.priority,
  sourceRepresentation: config.instructions.sourceRepresentation,
  filters: config.filters,
  fields: config.instructions.fields.map((field) => ({
    source: field.source,
    jsonPath: field.jsonPath,
    display: field.display,
    id: `${field.source}-${field.jsonPath}-${Math.random()}`,
  })),
});

export const getParserSourceOptions = (
  sourceRepresentation: ObservationIoParserSourceRepresentation,
): ObservationIoParserSource[] =>
  sourceRepresentation === "normalized_chat"
    ? ["conversation", "input", "output", "metadata"]
    : ["input", "output", "metadata"];
