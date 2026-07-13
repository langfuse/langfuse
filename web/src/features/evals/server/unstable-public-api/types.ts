import type { EvalTemplate } from "@langfuse/shared/src/db";
import type {
  JobConfiguration,
  Prisma as PrismaNamespace,
  prisma,
} from "@langfuse/shared/src/db";
import type {
  PublicEvaluationRuleEvaluatorReferenceType,
  PublicEvaluationRuleEvaluatorType,
  PublicEvaluationRuleFilterType,
  PublicEvaluationRuleMappingType,
  PublicEvaluationRuleStatusType,
  PublicEvaluationRuleTargetType,
  PublicEvaluatorModelConfigType,
  PublicEvaluatorOutputDefinitionType,
  PublicEvaluatorScopeType,
  PublicCodeEvaluatorSourceCodeLanguageType,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
} from "@/src/features/public-api/types/unstable-public-evals-contract";
import type { CODE_EVAL_TEMPLATE_VARIABLES } from "@langfuse/shared";

export type PrismaClientLike =
  | typeof prisma
  | PrismaNamespace.TransactionClient;

type ApiEvaluatorRecordBase = {
  id: string;
  name: string;
  version: number;
  scope: PublicEvaluatorScopeType;
  variables: string[];
  evaluationRuleCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ApiLlmAsJudgeEvaluatorRecord = ApiEvaluatorRecordBase & {
  type: typeof PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE;
  prompt: string;
  outputDefinition: PublicEvaluatorOutputDefinitionType;
  modelConfig: PublicEvaluatorModelConfigType | null;
};

export type ApiCodeEvaluatorRecord = ApiEvaluatorRecordBase & {
  type: typeof PUBLIC_EVALUATOR_TYPE_CODE;
  variables: Array<(typeof CODE_EVAL_TEMPLATE_VARIABLES)[number]>;
  sourceCode: string;
  sourceCodeLanguage: PublicCodeEvaluatorSourceCodeLanguageType;
};

export type ApiEvaluatorRecord =
  | ApiLlmAsJudgeEvaluatorRecord
  | ApiCodeEvaluatorRecord;

export type ApiEvaluationRuleRecord = {
  id: string;
  name: string;
  evaluator: PublicEvaluationRuleEvaluatorType;
  target: PublicEvaluationRuleTargetType;
  enabled: boolean;
  status: PublicEvaluationRuleStatusType;
  pausedReason: string | null;
  pausedMessage: string | null;
  sampling: number;
  filter: PublicEvaluationRuleFilterType[];
  mapping: PublicEvaluationRuleMappingType[];
  createdAt: Date;
  updatedAt: Date;
};

export type EvaluationRuleEvaluatorFamilyReference =
  PublicEvaluationRuleEvaluatorReferenceType;

export type StoredPublicEvaluatorTemplate = Pick<
  EvalTemplate,
  | "id"
  | "projectId"
  | "name"
  | "version"
  | "prompt"
  | "type"
  | "partner"
  | "provider"
  | "model"
  | "modelParams"
  | "vars"
  | "outputDefinition"
  | "sourceCode"
  | "sourceCodeLanguage"
  | "createdAt"
  | "updatedAt"
>;

export type StoredPublicEvaluationRuleConfig = Pick<
  JobConfiguration,
  | "id"
  | "projectId"
  | "evalTemplateId"
  | "scoreName"
  | "targetObject"
  | "filter"
  | "variableMapping"
  | "sampling"
  | "status"
  | "blockedAt"
  | "blockReason"
  | "blockMessage"
  | "createdAt"
  | "updatedAt"
> & {
  evalTemplate: Pick<EvalTemplate, "id" | "projectId" | "name" | "type"> | null;
};
