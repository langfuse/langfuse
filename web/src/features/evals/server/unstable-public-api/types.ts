import type {
  EvaluationRule,
  EvaluationRuleEvaluatorAssignment,
  Evaluator,
  EvaluatorVersion,
  Prisma as PrismaNamespace,
  prisma,
} from "@langfuse/shared/src/db";
import type {
  PublicEvaluationRuleEvaluatorReferenceType,
  PublicEvaluationRuleEvaluatorType,
  PublicEvaluationRuleFilterType,
  PublicEvaluationRuleReadFilterType,
  PromptVariableMappingReadType,
  PublicEvaluationRuleStatusType,
  PublicEvaluationRuleTargetType,
  LegacyPromptVariableMappingType,
  PublicEvaluationRuleLegacyTargetType,
  PublicEvaluatorModelConfigType,
  PublicEvaluatorOutputDefinitionType,
  PublicCodeEvaluatorSourceCodeLanguageType,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
} from "@/src/features/public-api/server";
import type {
  CODE_EVAL_TEMPLATE_VARIABLES,
  FilterCondition,
  JobTimeScope,
} from "@langfuse/shared";

export type PrismaClientLike =
  | typeof prisma
  | PrismaNamespace.TransactionClient;

type ApiEvaluatorRecordBase = {
  id: string;
  name: string;
  version: number;
  variables: string[];
  // Read shape: an evaluator default can be incomplete or name experiment-only sources.
  mapping: PromptVariableMappingReadType[] | null;
  evaluationRuleCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredPublicV2EvaluationRule = EvaluationRule & {
  assignments: Array<
    EvaluationRuleEvaluatorAssignment & {
      evaluator: Evaluator & { versions: EvaluatorVersion[] };
    }
  >;
};

type ApiLlmAsJudgeEvaluatorRecord = ApiEvaluatorRecordBase & {
  type: typeof PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE;
  prompt: string;
  outputDefinition: PublicEvaluatorOutputDefinitionType;
  modelConfig: PublicEvaluatorModelConfigType | null;
};

type ApiCodeEvaluatorRecord = ApiEvaluatorRecordBase & {
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
  evaluator: PublicEvaluationRuleEvaluatorType | null;
  enabled: boolean;
  status: PublicEvaluationRuleStatusType;
  pausedReason: string | null;
  pausedMessage: string | null;
  sampling: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ApiWritableEvaluationRuleRecord = ApiEvaluationRuleRecordBase & {
  evaluators: Array<{
    evaluator: PublicEvaluationRuleEvaluatorType;
    mapping: PromptVariableMappingReadType[] | null;
  }>;
  target: PublicEvaluationRuleTargetType;
  filter: PublicEvaluationRuleFilterType[];
  mapping: PromptVariableMappingReadType[];
};

type ApiLegacyEvaluationRuleRecord = ApiEvaluationRuleRecordBase & {
  evaluators: Array<{
    evaluator: PublicEvaluationRuleEvaluatorType;
    mapping: LegacyPromptVariableMappingType[] | null;
  }>;
  target: PublicEvaluationRuleLegacyTargetType;
  delay: number;
  timeScope: JobTimeScope[];
  filter: FilterCondition[];
  mapping: LegacyPromptVariableMappingType[];
};

type ApiReadableV2EvaluationRuleRecord = Omit<
  ApiWritableEvaluationRuleRecord,
  "filter"
> & {
  filter: PublicEvaluationRuleReadFilterType[];
};

export type ApiEvaluationRuleRecord =
  | ApiReadableV2EvaluationRuleRecord
  | ApiLegacyEvaluationRuleRecord;

export type EvaluationRuleEvaluatorFamilyReference =
  PublicEvaluationRuleEvaluatorReferenceType;

export type StoredPublicEvaluatorTemplate = Pick<
  Evaluator,
  "id" | "projectId" | "name" | "type" | "createdAt" | "updatedAt"
> &
  Pick<
    EvaluatorVersion,
    | "version"
    | "prompt"
    | "partner"
    | "provider"
    | "model"
    | "modelParams"
    | "vars"
    | "outputDefinition"
    | "sourceCode"
    | "sourceCodeLanguage"
    | "variableMapping"
  > & {
    promptMessages?: EvaluatorVersion["promptMessages"];
  };
