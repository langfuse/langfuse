import { APITrace } from "@/src/features/public-api/types/traces";
import {
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "@langfuse/shared";
import { stringDateTime } from "@langfuse/shared/src/server";

import { z } from "zod/v4";

/**
 * Objects
 */

const APISession = z
  .strictObject({
    id: z.string(),
    createdAt: z.coerce.date(),
    projectId: z.string(),
    environment: z.string(),
  })
  .strict();

/**
 * Endpoints
 */

// GET /sessions
export const GetSessionsV1Query = z.object({
  ...publicApiPaginationZod,
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
  environment: z.union([z.array(z.string()), z.string()]).nullish(),
});
export const GetSessionsV1Response = z
  .object({
    data: z.array(APISession),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /sessions/:id
export const GetSessionV1Query = z.object({
  sessionId: z.string(),
});
export const GetSessionV1Response = APISession.extend({
  traces: z.array(APITrace),
}).strict();
