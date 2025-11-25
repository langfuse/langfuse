import { z } from "zod/v4";
import {
  LegacySpanPatchSchema,
  LegacySpanPostSchema,
} from "@langfuse/shared/src/server";

// POST /spans
export const PostSpansV1Body = LegacySpanPostSchema;
export const PostSpansV1Response = z.object({ id: z.string() });

// PATCH /spans
export const PatchSpansV1Body = LegacySpanPatchSchema;
export const PatchSpansV1Response = z.object({ id: z.string() });
