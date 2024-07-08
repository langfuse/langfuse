// src/features/public-api/types/generations.ts

import { type z } from "zod";
import {
  LegacyGenerationsCreateSchema,
  LegacyGenerationPatchSchema,
  eventTypes,
  type ingestionApiSchema,
} from "@langfuse/shared";
import { v4 as uuidv4 } from "uuid";
import { APIBaseObservation } from "@/src/features/public-api/types/observations";

/**
 * Transforms
 */

export const transformGenerationPostToIngestionBatch = ({
  prompt,
  completion,
  ...generation
}: z.infer<typeof LegacyGenerationsCreateSchema>): z.infer<
  typeof ingestionApiSchema
>["batch"] => {
  return [
    {
      id: uuidv4(),
      type: eventTypes.OBSERVATION_CREATE,
      timestamp: new Date().toISOString(),
      body: {
        ...generation,
        type: "GENERATION",
        input: prompt,
        output: completion,
      },
    },
  ];
};

export const transformGenerationPatchToIngestionBatch = ({
  generationId,
  prompt,
  completion,
  ...generation
}: z.infer<typeof LegacyGenerationPatchSchema>): z.infer<
  typeof ingestionApiSchema
>["batch"] => {
  return [
    {
      id: uuidv4(),
      type: eventTypes.OBSERVATION_UPDATE,
      timestamp: new Date().toISOString(),
      body: {
        ...generation,
        id: generationId,
        type: "GENERATION",
        input: prompt,
        output: completion,
      },
    },
  ];
};

/**
 * Endpoints
 */

// POST /generations
export const PostGenerationsV1Body = LegacyGenerationsCreateSchema;
export const PostGenerationsV1Response = APIBaseObservation;

// PATCH /generations
export const PatchGenerationsV1Body = LegacyGenerationPatchSchema;
export const PatchGenerationsV1Response = APIBaseObservation;
