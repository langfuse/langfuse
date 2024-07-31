import { z } from "zod";
import {
  LegacySpanPatchSchema,
  LegacySpanPostSchema,
  eventTypes,
  type ingestionApiSchema,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

/**
 * Objects
 */

/**
 * Transforms
 */

export const transformLegacySpanPostToIngestionBatch = (
  span: z.infer<typeof LegacySpanPostSchema>,
): z.infer<typeof ingestionApiSchema>["batch"] => {
  return [
    {
      id: v4(),
      type: eventTypes.OBSERVATION_CREATE,
      timestamp: new Date().toISOString(),
      body: {
        ...span,
        type: "SPAN",
      },
    },
  ];
};

export const transformLegacySpanPatchToIngestionBatch = ({
  spanId,
  ...span
}: z.infer<typeof LegacySpanPatchSchema>): z.infer<
  typeof ingestionApiSchema
>["batch"] => {
  return [
    {
      id: v4(),
      type: eventTypes.OBSERVATION_UPDATE,
      timestamp: new Date().toISOString(),
      body: {
        ...span,
        id: spanId,
        type: "SPAN",
      },
    },
  ];
};

/**
 * Endpoints
 */

// POST /spans
export const PostSpansV1Body = LegacySpanPostSchema;
export const PostSpansV1Response = z.object({ id: z.string() });

// PATCH /spans
export const PatchSpansV1Body = LegacySpanPatchSchema;
export const PatchSpansV1Response = z.object({ id: z.string() });
