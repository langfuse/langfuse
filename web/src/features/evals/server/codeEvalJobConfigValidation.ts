import { z } from "zod";
import {
  EvalTargetObject,
  observationVariableMapping,
  type EvalTargetObject as EvalTargetObjectType,
  type FilterCondition,
} from "@langfuse/shared";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/src/env.mjs";
import {
  CodeEvalTestRunSetupError,
  runCodeEvalTestForJobConfig,
} from "@/src/features/evals/server/codeEvalTestRun";
import { assertUnreachable } from "@/src/utils/types";

export type CodeEvalJobConfigErrorCode =
  | "invalid_target"
  | "invalid_request"
  | "resource_not_found"
  | "preflight_failed";

export class CodeEvalJobConfigError extends Error {
  constructor(
    message: string,
    readonly code: CodeEvalJobConfigErrorCode = "preflight_failed",
  ) {
    super(message);
    this.name = "CodeEvalJobConfigError";
    Object.setPrototypeOf(this, CodeEvalJobConfigError.prototype);
  }
}

export async function assertCodeEvalJobConfigCanRun(params: {
  prisma: PrismaClient;
  orgId: string;
  projectId: string;
  evalTemplateId: string;
  target: EvalTargetObjectType;
  mapping: unknown;
  scoreName: string;
  filter: FilterCondition[] | null;
}): Promise<void> {
  if (
    params.target !== EvalTargetObject.EVENT &&
    params.target !== EvalTargetObject.EXPERIMENT
  ) {
    throw new CodeEvalJobConfigError(
      "Code evaluators can only run on observations or experiments.",
      "invalid_target",
    );
  }

  const parsedMapping = z
    .array(observationVariableMapping)
    .parse(params.mapping);

  if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true") {
    const result = await runCodeEvalTestForJobConfig({
      prisma: params.prisma,
      orgId: params.orgId,
      projectId: params.projectId,
      evalTemplateId: params.evalTemplateId,
      target: params.target,
      mapping: parsedMapping,
      scoreName: params.scoreName,
      filter: params.filter,
    }).catch((error) => {
      if (!(error instanceof CodeEvalTestRunSetupError)) {
        throw error;
      }

      switch (error.code) {
        case "INVALID_TARGET":
          throw new CodeEvalJobConfigError(error.message, "invalid_target");
        case "TEMPLATE_NOT_FOUND":
          throw new CodeEvalJobConfigError(error.message, "resource_not_found");
        case "UNSUPPORTED_LANGUAGE":
          throw new CodeEvalJobConfigError(error.message, "invalid_request");
        case "DISPATCHER_NOT_CONFIGURED":
        case "OBSERVATION_NOT_FOUND":
          throw new CodeEvalJobConfigError(error.message);
        default:
          return assertUnreachable(error.code);
      }
    });

    if (!result) {
      if (params.target !== EvalTargetObject.EXPERIMENT) {
        throw new CodeEvalJobConfigError(
          "No matching observation found to test this code evaluator. Adjust the filters and try again.",
        );
      }

      return;
    }

    if (!result.success) {
      throw new CodeEvalJobConfigError(result.error.message);
    }
  }
}
