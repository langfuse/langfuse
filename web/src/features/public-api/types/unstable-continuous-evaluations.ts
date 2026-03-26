import { z } from "zod";
import {
  PublicContinuousEvaluationFilter,
  PublicContinuousEvaluationMapping,
  PublicContinuousEvaluationStatus,
  PublicContinuousEvaluationTarget,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-evals-shared";

export const APIContinuousEvaluation = z
  .object({
    id: z.string(),
    name: z.string(),
    evaluatorId: z.string(),
    target: PublicContinuousEvaluationTarget,
    enabled: z.boolean(),
    status: PublicContinuousEvaluationStatus,
    pausedReason: z.string().nullable(),
    pausedMessage: z.string().nullable(),
    sampling: z.number().gt(0).lte(1),
    filter: z.array(PublicContinuousEvaluationFilter),
    mapping: z.array(PublicContinuousEvaluationMapping),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const GetUnstableContinuousEvaluationsQuery =
  UnstablePublicApiPaginationQuery;

export const GetUnstableContinuousEvaluationsResponse = z
  .object({
    data: z.array(APIContinuousEvaluation),
    meta: UnstablePublicApiPaginationResponse,
  })
  .strict();

export const GetUnstableContinuousEvaluationQuery = z
  .object({
    continuousEvaluationId: z.string(),
  })
  .strict();

export const GetUnstableContinuousEvaluationResponse = APIContinuousEvaluation;

export const PostUnstableContinuousEvaluationBody = z
  .object({
    name: z.string().min(1),
    evaluatorId: z.string(),
    target: PublicContinuousEvaluationTarget,
    enabled: z.boolean(),
    sampling: z.number().gt(0).lte(1).default(1),
    filter: z.array(PublicContinuousEvaluationFilter).default([]),
    mapping: z.array(PublicContinuousEvaluationMapping),
  })
  .strict();
export type PostUnstableContinuousEvaluationBodyType = z.infer<
  typeof PostUnstableContinuousEvaluationBody
>;

export const PostUnstableContinuousEvaluationResponse = APIContinuousEvaluation;

export const PatchUnstableContinuousEvaluationQuery =
  GetUnstableContinuousEvaluationQuery;

export const PatchUnstableContinuousEvaluationBody = z
  .object({
    name: z.string().min(1).optional(),
    evaluatorId: z.string().optional(),
    target: PublicContinuousEvaluationTarget.optional(),
    enabled: z.boolean().optional(),
    sampling: z.number().gt(0).lte(1).optional(),
    filter: z.array(PublicContinuousEvaluationFilter).optional(),
    mapping: z.array(PublicContinuousEvaluationMapping).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "Request body cannot be empty. At least one field must be provided for update.",
  });
export type PatchUnstableContinuousEvaluationBodyType = z.infer<
  typeof PatchUnstableContinuousEvaluationBody
>;

export const PatchUnstableContinuousEvaluationResponse =
  APIContinuousEvaluation;

export const DeleteUnstableContinuousEvaluationQuery =
  GetUnstableContinuousEvaluationQuery;

export const DeleteUnstableContinuousEvaluationResponse = z
  .object({
    message: z.literal("Continuous evaluation successfully deleted"),
  })
  .strict();
