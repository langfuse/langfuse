import { z } from "zod";
import {
  EvalTargetObject,
  observationVariableMapping,
  type EvalTargetObject as EvalTargetObjectType,
  type FilterCondition,
} from "@langfuse/shared";
import type { PrismaClient } from "@prisma/client";
import { env } from "@/src/env.mjs";
import { runCodeEvalTestForJobConfig } from "@/src/features/evals/server/codeEvalTestRun";

export class CodeEvalJobConfigInvalidTargetError extends Error {
  constructor() {
    super("Code evaluators can only run on observations or experiments.");
    this.name = "CodeEvalJobConfigInvalidTargetError";
    Object.setPrototypeOf(this, CodeEvalJobConfigInvalidTargetError.prototype);
  }
}

export class CodeEvalJobConfigPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeEvalJobConfigPreflightError";
    Object.setPrototypeOf(this, CodeEvalJobConfigPreflightError.prototype);
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
    throw new CodeEvalJobConfigInvalidTargetError();
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
    });

    if (!result) {
      if (params.target !== EvalTargetObject.EXPERIMENT) {
        throw new CodeEvalJobConfigPreflightError(
          "No matching observation found to test this code evaluator. Adjust the filters and try again.",
        );
      }

      return;
    }

    if (!result.success) {
      throw new CodeEvalJobConfigPreflightError(result.error.message);
    }
  }
}
