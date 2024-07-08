import { ApiTrace } from "@/src/features/public-api/types/traces";
import { z } from "zod";

/**
 * Objects
 */

const Session = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  projectId: z.string(),
  bookmarked: z.boolean(),
  public: z.boolean(),
});

/**
 * Endpoints
 */

// Get /sessions/:id
export const GetSessionV1Query = z.object({
  sessionId: z.string(),
});
export const GetSessionV1Response = Session.extend({
  traces: z.array(ApiTrace),
});
