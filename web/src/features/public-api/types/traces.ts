import { APIObservation } from "@/src/features/public-api/types/observations";
import {
  APIScoreSchemaV1,
  paginationMetaResponseZod,
  orderBy,
  publicApiPaginationZod,
} from "@langfuse/shared";
import { stringDateTime, TraceBody } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

/**
 * Field groups for selective field fetching
 */
export const TRACE_FIELD_GROUPS = [
  "core",
  "io",
  "scores",
  "observations",
  "metrics",
] as const;

export type TraceFieldGroup = (typeof TRACE_FIELD_GROUPS)[number];

/**
 * Objects
 */

export const APITrace = z
  .object({
    id: z.string(),
    externalId: z.string().nullable(),
    timestamp: z.coerce.date(),
    name: z.string().nullable(),
    userId: z.string().nullable(),
    metadata: z.any(), // Prisma JSON
    release: z.string().nullable(),
    version: z.string().nullable(),
    projectId: z.string(),
    environment: z.string().default("default"),
    public: z.boolean(),
    bookmarked: z.boolean(),
    tags: z.array(z.string()),
    input: z.any(), // Prisma JSON
    output: z.any(), // Prisma JSON
    sessionId: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

const APIExtendedTrace = APITrace.extend({
  observations: z.array(z.string()).nullish(),
  scores: z.array(z.string()).nullish(),
  totalCost: z.number().nullish(),
  latency: z.number().nullish(),
  htmlPath: z.string(),
}).strict();

/**
 * Endpoints
 */

// GET /api/public/traces
export const GetTracesV1Query = z.object({
  ...publicApiPaginationZod,
  userId: z.string().nullish(),
  name: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  environment: z.union([z.array(z.string()), z.string()]).nullish(),
  sessionId: z.string().nullish(),
  version: z.string().nullish(),
  release: z.string().nullish(),
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
  orderBy: z
    .string() // orderBy=timestamp.asc
    .nullish()
    .transform((v) => {
      if (!v) return null;
      const [column, order] = v.split(".");
      return { column, order: order?.toUpperCase() };
    })
    .pipe(orderBy.nullable()),
  fields: z
    .string()
    .nullish()
    .transform((v) => {
      if (!v) return null;
      return v
        .split(",")
        .map((f) => f.trim())
        .filter((f) => TRACE_FIELD_GROUPS.includes(f as TraceFieldGroup));
    })
    .pipe(z.array(z.enum(TRACE_FIELD_GROUPS)).nullable()),
});
export const GetTracesV1Response = z
  .object({
    data: z.array(APIExtendedTrace),
    meta: paginationMetaResponseZod,
  })
  .strict();

// POST /api/public/traces
export const PostTracesV1Body = TraceBody;
export const PostTracesV1Response = z.object({ id: z.string() });

// GET /api/public/traces/{traceId}
export const GetTraceV1Query = z.object({
  traceId: z.string(),
});
export const GetTraceV1Response = APIExtendedTrace.extend({
  scores: z.array(APIScoreSchemaV1),
  observations: z.array(APIObservation),
}).strict();

// DELETE /api/public/traces/{traceId}
export const DeleteTraceV1Query = z.object({
  traceId: z.string(),
});
export const DeleteTraceV1Response = z
  .object({
    message: z.string(),
  })
  .strict();

// DELETE /api/public/traces
export const DeleteTracesV1Body = z
  .object({
    traceIds: z.array(z.string()).min(1, "At least 1 traceId is required."),
  })
  .strict();
export const DeleteTracesV1Response = z
  .object({
    message: z.string(),
  })
  .strict();
