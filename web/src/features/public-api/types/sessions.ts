import { APITrace } from "@/src/features/public-api/types/traces";
import {
  paginationMetaResponseZod,
  paginationZod,
  stringDateTime,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */

const APISession = z.strictObject({
  id: z.string(),
  createdAt: z.coerce.date(),
  projectId: z.string(),
});

/**
 * Endpoints
 */

// GET /sessions
export const GetSessionsV1Query = z.object({
  ...paginationZod,
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
});
export const GetSessionsV1Response = z.object({
  data: z.array(APISession),
  meta: paginationMetaResponseZod,
});

// GET /sessions/:id
export const GetSessionV1Query = z.object({
  sessionId: z.string(),
});
export const GetSessionV1Response = APISession.extend({
  traces: z.array(APITrace),
});
