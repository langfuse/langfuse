import type {
  EvalTemplate,
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
} from "@/src/features/public-api/types/unstable-public-evals-contract";

export type PrismaClientLike =
  | typeof prisma
  | PrismaNamespace.TransactionClient;

export type ApiEvaluatorRecord = {
  id: string;
  name: string;
  version: number;
  scope: PublicEvaluatorScopeType;
  type: "llm_as_judge";
  prompt: string;
  variables: string[];
  outputDefinition: PublicEvaluatorOutputDefinitionType;
  modelConfig: PublicEvaluatorModelConfigType | null;
  evaluationRuleCount: number;
  createdAt: Date;
  updatedAt: Date;
};

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
  | "partner"
  | "provider"
  | "model"
  | "modelParams"
  | "vars"
  | "outputDefinition"
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
  evalTemplate: Pick<
    EvalTemplate,
    "id" | "projectId" | "name" | "vars" | "prompt"
  > | null;
};
