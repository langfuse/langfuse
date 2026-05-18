import { type JobConfiguration, type JobExecution } from "@prisma/client";
import { type EvalTemplateCodeBased } from "@langfuse/shared";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { type EvalExecutionResult } from "../evalCompletion";
import { type EvalExecutionDeps } from "../evalExecutionDeps";
import { type ExtractedVariable } from "../observationEval/extractObservationVariables";

export async function executeCodeBasedEvaluation(_params: {
  projectId: string;
  jobExecutionId: string;
  job: JobExecution;
  config: JobConfiguration;
  template: EvalTemplateCodeBased;
  extractedVariables: ExtractedVariable[];
  environment: string;
  deps?: EvalExecutionDeps;
}): Promise<EvalExecutionResult> {
  return Promise.reject(
    new UnrecoverableError("Code-based eval execution is not implemented yet"),
  );
}
