import { z } from "zod";
import {
  OBSERVATION_FIELD_GROUPS_PUBLIC_API,
  type ObservationFieldGroupPublicApi,
  type ObservationMcpAllowedEventsTableFilterColumn,
} from "@langfuse/shared";
import { OBSERVATION_FIELD_GROUP_FIELD_NAMES } from "@langfuse/shared/src/server";

type ObservationMcpFieldMetadata = {
  type: ObservationMcpFieldType;
  nullable?: boolean;
  default?: boolean;
  expensive?: boolean;
  sensitive?: boolean;
};

type ObservationMcpFieldDefinition = ObservationMcpFieldMetadata & {
  field: ObservationMcpField;
  group: ObservationFieldGroupPublicApi;
};

type ObservationMcpField =
  (typeof OBSERVATION_FIELD_GROUP_FIELD_NAMES)[ObservationFieldGroupPublicApi][number];

type ObservationMcpFieldType =
  | "array"
  | "boolean"
  | "datetime"
  | "map<string, number>"
  | "number"
  | "record"
  | "string"
  | "unknown";

const OBSERVATION_MCP_FIELDS = OBSERVATION_FIELD_GROUPS_PUBLIC_API.flatMap(
  (group) => OBSERVATION_FIELD_GROUP_FIELD_NAMES[group],
);

const OBSERVATION_MCP_FIELD_SET = new Set<string>(OBSERVATION_MCP_FIELDS);

const OBSERVATION_MCP_FIELD_METADATA: Record<
  ObservationMcpField,
  ObservationMcpFieldMetadata
> = {
  id: { type: "string", default: true },
  traceId: { type: "string", nullable: true, default: true },
  startTime: { type: "datetime", default: true },
  endTime: { type: "datetime", nullable: true, default: true },
  projectId: { type: "string", sensitive: true },
  parentObservationId: { type: "string", nullable: true, default: true },
  type: { type: "string", default: true },
  name: { type: "string", nullable: true, default: true },
  level: { type: "string", default: true },
  statusMessage: { type: "string", nullable: true, default: true },
  version: { type: "string", nullable: true },
  environment: { type: "string", nullable: true },
  bookmarked: { type: "boolean" },
  public: { type: "boolean" },
  userId: { type: "string", nullable: true, sensitive: true },
  sessionId: { type: "string", nullable: true, sensitive: true },
  completionStartTime: { type: "datetime", nullable: true },
  createdAt: { type: "datetime" },
  updatedAt: { type: "datetime" },
  input: { type: "unknown", expensive: true, sensitive: true },
  output: { type: "unknown", expensive: true, sensitive: true },
  metadata: { type: "record", expensive: true, sensitive: true },
  providedModelName: { type: "string", nullable: true, default: true },
  internalModelId: { type: "string", nullable: true },
  modelParameters: {
    type: "record",
    nullable: true,
    expensive: true,
    sensitive: true,
  },
  usageDetails: { type: "map<string, number>" },
  costDetails: { type: "map<string, number>" },
  totalCost: { type: "number", nullable: true },
  promptId: { type: "string", nullable: true },
  promptName: { type: "string", nullable: true },
  promptVersion: { type: "number", nullable: true },
  latency: { type: "number", nullable: true, default: true },
  timeToFirstToken: { type: "number", nullable: true },
  tags: { type: "array", sensitive: true },
  release: { type: "string", nullable: true },
  traceName: { type: "string", nullable: true, sensitive: true },
  usagePricingTierName: { type: "string", nullable: true },
} as const;

export type { ObservationMcpField };

export const OBSERVATION_MCP_FIELD_DEFINITIONS: ObservationMcpFieldDefinition[] =
  OBSERVATION_FIELD_GROUPS_PUBLIC_API.flatMap((group) =>
    OBSERVATION_FIELD_GROUP_FIELD_NAMES[group].map((field) => ({
      field,
      group,
      ...OBSERVATION_MCP_FIELD_METADATA[field],
    })),
  );

export const OBSERVATION_MCP_DEFAULT_FIELDS = OBSERVATION_MCP_FIELDS.filter(
  (field) => Boolean(OBSERVATION_MCP_FIELD_METADATA[field].default),
);

const isObservationMcpField = (field: string): field is ObservationMcpField =>
  OBSERVATION_MCP_FIELD_SET.has(field);

export const ObservationFieldsSchema = z
  .array(z.string())
  .optional()
  .superRefine((fields, ctx) => {
    if (!fields) return;

    if (fields.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "Fields array cannot be empty. Use undefined for defaults or specify fields.",
      });
      return;
    }

    const hasWildcard = fields.includes("*");
    if (hasWildcard && fields.length > 1) {
      ctx.addIssue({
        code: "custom",
        message:
          'Use either fields: ["*"] or explicit field names. Mixed wildcard projection is invalid.',
      });
      return;
    }

    for (const field of fields) {
      if (field !== "*" && !OBSERVATION_MCP_FIELD_SET.has(field)) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid observation field "${field}". Call getObservationFieldSchema for accepted fields.`,
        });
      }
    }
  })
  .describe(
    'Observation fields to include in the response. Omit for compact defaults, use ["*"] for all available fields, or pass specific field names to keep responses small. Call getObservationFieldSchema to list accepted fields.',
  );

export const ObservationLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(50)
  .describe("Number of observations to return (1-100, default: 50)");

export const ExpandMetadataKeysSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Metadata keys to expand. Only used when metadata is projected or fields is ["*"].',
  );

type ObservationMcpFilterColumn =
  | Exclude<ObservationMcpAllowedEventsTableFilterColumn, "traceTags">
  | "tags";

export type { ObservationMcpFilterColumn };

export const getProjectionFields = (
  fields: string[] | undefined,
): ObservationMcpField[] => {
  if (!fields) return [...OBSERVATION_MCP_DEFAULT_FIELDS];
  if (fields.length === 1 && fields[0] === "*")
    return [...OBSERVATION_MCP_FIELDS];
  return fields.filter(isObservationMcpField);
};

export const getProjectionFieldGroups = (
  fields: ObservationMcpField[],
): ObservationFieldGroupPublicApi[] => {
  const groups = new Set<ObservationFieldGroupPublicApi>(["core"]);
  const projectionFields = new Set(fields);
  for (const definition of OBSERVATION_MCP_FIELD_DEFINITIONS) {
    if (projectionFields.has(definition.field)) {
      groups.add(definition.group);
    }
  }
  return Array.from(groups);
};

export const projectObservation = (
  observation: Record<string, unknown>,
  fields: ObservationMcpField[],
): Record<string, unknown> => {
  const projected: Record<string, unknown> = {};

  for (const field of fields) {
    if (field === "providedModelName" && "model" in observation) {
      projected[field] = observation.model;
    } else if (field in observation) {
      projected[field] = observation[field];
    }
  }

  return projected;
};

export const getMetadataExpansionForProjection = (
  fields: ObservationMcpField[],
  expandMetadataKeys: string[] | undefined,
): string[] | undefined => {
  if (!fields.includes("metadata")) return undefined;
  return expandMetadataKeys;
};
