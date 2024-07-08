import {
  paginationZod,
  paginationMetaResponseZod,
  stringDate,
  orderBy,
  TraceBody,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */

const Trace = z.object({
  id: z.string(),
  externalId: z.string().nullable(),
  timestamp: z.coerce.date(),
  name: z.string().nullable(),
  userId: z.string().nullable(),
  metadata: z.any(), // Prisma JSON
  release: z.string().nullable(),
  version: z.string().nullable(),
  projectId: z.string(),
  public: z.boolean(),
  bookmarked: z.boolean(),
  tags: z.array(z.string()),
  input: z.any(), // Prisma JSON
  output: z.any(), // Prisma JSON
  sessionId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const ExtendedTrace = Trace.extend({
  observations: z.array(z.string()),
  scores: z.array(z.string()),
  totalCost: z.number(),
  latency: z.number(),
  htmlPath: z.string(),
});

/**
 * Endpoints
 */

// GET /api/public/traces
export const GetTracesV1Query = z.object({
  ...paginationZod,
  userId: z.string().nullish(),
  name: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  sessionId: z.string().nullish(),
  fromTimestamp: stringDate,
  orderBy: z
    .string() // orderBy=timestamp.asc
    .nullish()
    .transform((v) => {
      if (!v) return null;
      const [column, order] = v.split(".");
      return { column, order: order?.toUpperCase() };
    })
    .pipe(orderBy.nullish()),
});

export const GetTracesV1Response = z.object({
  data: z.array(ExtendedTrace),
  meta: paginationMetaResponseZod,
});

// POST /api/public/traces
export const PostTracesV1Body = TraceBody;
export const PostTracesV1Response = Trace;

// GET /api/public/traces/{traceId}
export const GetTraceV1Query = z.object({
  traceId: z.string(),
});
export const GetTraceV1Response = ExtendedTrace.extend({
  scores: z.array(z.any()), // TODO: Define Score type
  observations: z.array(z.any()), // TODO: Define Observation type
});
