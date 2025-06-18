// src/features/public-api/types/generations.ts

import { z } from "zod/v4";
import {
  LegacyGenerationsCreateSchema,
  LegacyGenerationPatchSchema,
} from "@langfuse/shared/src/server";

// POST /generations
export const PostGenerationsV1Body = LegacyGenerationsCreateSchema;
export const PostGenerationsV1Response = z.object({ id: z.string() });

// PATCH /generations
export const PatchGenerationsV1Body = LegacyGenerationPatchSchema;
export const PatchGenerationsV1Response = z.object({ id: z.string() });
