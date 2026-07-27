import type { EvalTemplate } from "@langfuse/shared/src/db";
import type { FilterCondition, JobTimeScope } from "@langfuse/shared";
import type {
  JobConfiguration,
  Prisma as PrismaNamespace,
  prisma,
} from "@langfuse/shared/src/db";
import type {
  LegacyEvaluationRuleMappingType,
  PublicEvaluationRuleEvaluatorReferenceType,
  PublicEvaluationRuleEvaluatorType,
  PublicEvaluationRuleFilterType,
  PublicEvaluationRuleMappingType,
  PublicEvaluationRuleLegacyTargetType,
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

type ApiEvaluationRuleRecordBase = {
  id: string;
  name: string;
  evaluator: PublicEvaluationRuleEvaluatorType;
  enabled: boolean;
  status: PublicEvaluationRuleStatusType;
  pausedReason: string | null;
  pausedMessage: string | null;
  sampling: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ApiWritableEvaluationRuleRecord = ApiEvaluationRuleRecordBase & {
  target: PublicEvaluationRuleTargetType;
  filter: PublicEvaluationRuleFilterType[];
  mapping: PublicEvaluationRuleMappingType[];
};

export type ApiLegacyEvaluationRuleRecord = ApiEvaluationRuleRecordBase & {
  target: PublicEvaluationRuleLegacyTargetType;
  delay: number;
  timeScope: JobTimeScope[];
  filter: FilterCondition[];
  mapping: LegacyEvaluationRuleMappingType[];
};

export type ApiEvaluationRuleRecord =
  | ApiWritableEvaluationRuleRecord
  | ApiLegacyEvaluationRuleRecord;

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
  | "delay"
  | "timeScope"
  | "status"
  | "blockedAt"
  | "blockReason"
  | "blockMessage"
  | "createdAt"
  | "updatedAt"
> & {
  evalTemplate: Pick<EvalTemplate, "id" | "projectId" | "name" | "type"> | null;
};
