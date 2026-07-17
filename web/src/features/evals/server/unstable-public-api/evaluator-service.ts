import { extractVariables } from "@langfuse/shared";
import {
  invalidateProjectEvalConfigCaches,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { type PostUnstableEvaluatorBodyParsedType } from "@/src/features/public-api/types/unstable-evaluators";
import {
  type PUBLIC_EVALUATOR_TYPE_CODE,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
} from "@/src/features/public-api/types/unstable-public-evals-contract";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import { CODE_EVAL_TEMPLATE_VARIABLES } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import { deleteEvalTemplateFamily } from "@/src/features/evals/server/evalTemplateDeletion";
import {
  toApiEvaluator,
  toStoredEvaluatorType,
  toStoredOutputDefinition,
} from "./adapters";
import {
  countEvaluationRulesForEvaluator,
  countEvaluationRulesForEvaluatorIds,
  findPublicEvaluatorTemplateOrThrow,
  listPublicEvaluatorTemplates,
} from "./queries";
import { assertEvaluatorDefinitionCanRunForPublicApi } from "./validation";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import type { StoredPublicEvaluatorTemplate } from "./types";
import { prepareVariableMappingForEvaluatorUpgrade } from "@/src/features/evals/server/evaluatorUpgrade";

function assertCodeEvaluatorDefinitionCanRunForPublicApi(
  input: Extract<
    PostUnstableEvaluatorBodyParsedType,
    { type: typeof PUBLIC_EVALUATOR_TYPE_CODE }
  >,
) {
  if (!isCodeEvalEnabled()) {
    throw createUnstablePublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: "Code evals are not enabled",
    });
  }

  if (!isCodeEvalSourceCodeLanguageSupported(input.sourceCodeLanguage)) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message:
        "This code evaluator language is not supported by the configured dispatcher.",
      details: {
        field: "sourceCodeLanguage",
        value: input.sourceCodeLanguage,
      },
    });
  }
}

export async function listPublicEvaluators(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const { templates, totalItems } = await listPublicEvaluatorTemplates(params);
  const evaluationRuleCounts = await countEvaluationRulesForEvaluatorIds({
    projectId: params.projectId,
    evaluatorIds: templates.map((template) => template.id),
  });

  return {
    data: templates.map((template) =>
      toApiEvaluator({
        template,
        evaluationRuleCount: evaluationRuleCounts[template.id] ?? 0,
      }),
    ),
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}

export async function getPublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
}) {
  const template = await findPublicEvaluatorTemplateOrThrow(params);
  const evaluationRuleCount = await countEvaluationRulesForEvaluator(params);

  return toApiEvaluator({
    template,
    evaluationRuleCount,
  });
}

export async function createPublicEvaluator(params: {
  projectId: string;
  input: PostUnstableEvaluatorBodyParsedType;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const { input } = params;
  const storedEvalTemplateType = toStoredEvaluatorType(input.type);
  const storedOutputDefinition =
    input.type === PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE
      ? toStoredOutputDefinition(input.outputDefinition)
      : undefined;
  const nextVariables =
    input.type === PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE
      ? extractVariables(input.prompt)
      : [...CODE_EVAL_TEMPLATE_VARIABLES];

  if (input.type === PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE) {
    await assertEvaluatorDefinitionCanRunForPublicApi({
      projectId: params.projectId,
      template: {
        name: input.name,
        provider: input.modelConfig?.provider ?? null,
        model: input.modelConfig?.model ?? null,
        outputDefinition: storedOutputDefinition,
      },
    });
  } else {
    assertCodeEvaluatorDefinitionCanRunForPublicApi(input);
  }

  try {
    const { template, upgradedConfigCount } = await prisma.$transaction(
      async (tx) => {
        const conflictingTemplate = await tx.evalTemplate.findFirst({
          where: {
            projectId: params.projectId,
            name: input.name,
            type: {
              not: storedEvalTemplateType,
            },
          },
          select: {
            type: true,
          },
        });

        if (conflictingTemplate) {
          throw createUnstablePublicApiError({
            httpCode: 409,
            code: "name_conflict",
            message: `An evaluator named "${input.name}" already exists with a different type in this project. Use a different name for the ${input.type} evaluator.`,
            details: {
              field: "name",
            },
          });
        }

        const existingProjectTemplates = await tx.evalTemplate.findMany({
          where: {
            projectId: params.projectId,
            name: input.name,
            type: storedEvalTemplateType,
          },
          orderBy: [
            {
              version: "desc",
            },
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],
          select: {
            id: true,
            version: true,
          },
        });
        const configsToUpgrade =
          existingProjectTemplates.length > 0
            ? await tx.jobConfiguration.findMany({
                where: {
                  projectId: params.projectId,
                  evalTemplateId: {
                    in: existingProjectTemplates.map(
                      (existingTemplate) => existingTemplate.id,
                    ),
                  },
                  evalTemplate: {
                    is: {
                      type: storedEvalTemplateType,
                    },
                  },
                },
                select: {
                  id: true,
                  scoreName: true,
                  targetObject: true,
                  variableMapping: true,
                },
              })
            : [];
        const upgradedConfigs = configsToUpgrade.map((config) => {
          const preparedMapping = prepareVariableMappingForEvaluatorUpgrade({
            templateType: storedEvalTemplateType,
            targetObject: config.targetObject,
            variableMapping: config.variableMapping,
            nextVariables,
          });

          if (preparedMapping.missingVariables.length > 0) {
            throw createUnstablePublicApiError({
              httpCode: 409,
              code: "conflict",
              message: `Creating a new evaluator version would invalidate the evaluation rule "${config.scoreName}" because it is missing mappings for new evaluator variables: ${preparedMapping.missingVariables.join(", ")}.`,
              details: {
                field: "mapping",
                variables: preparedMapping.missingVariables,
              },
            });
          }

          return {
            id: config.id,
            variableMapping: preparedMapping.variableMapping,
          };
        });
        const latestProjectTemplate = existingProjectTemplates[0];

        const template = await tx.evalTemplate.create({
          data: {
            projectId: params.projectId,
            name: input.name,
            version: (latestProjectTemplate?.version ?? 0) + 1,
            type: storedEvalTemplateType,
            prompt: input.prompt ?? null,
            provider: input.modelConfig?.provider ?? null,
            model: input.modelConfig?.model ?? null,
            modelParams: undefined,
            vars: nextVariables,
            outputDefinition: storedOutputDefinition,
            sourceCode: input.sourceCode ?? null,
            sourceCodeLanguage: input.sourceCodeLanguage ?? null,
          },
        });

        if (upgradedConfigs.length > 0) {
          await Promise.all(
            upgradedConfigs.map((config) =>
              tx.jobConfiguration.update({
                where: {
                  id: config.id,
                  projectId: params.projectId,
                },
                data: {
                  evalTemplateId: template.id,
                  variableMapping: config.variableMapping,
                },
              }),
            ),
          );
        }

        return {
          template,
          upgradedConfigCount: upgradedConfigs.length,
        };
      },
    );

    if (upgradedConfigCount > 0) {
      await invalidateProjectEvalConfigCaches(params.projectId);
    }

    const evaluationRuleCount = await countEvaluationRulesForEvaluator({
      projectId: params.projectId,
      evaluatorId: template.id,
    });

    const evaluator = toApiEvaluator({
      template: template as StoredPublicEvaluatorTemplate,
      evaluationRuleCount,
    });

    if (params.auditScope) {
      await auditLog({
        action: "create",
        resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evaluator.id,
        projectId: params.projectId,
        orgId: params.auditScope.orgId,
        apiKeyId: params.auditScope.apiKeyId,
        after: evaluator,
      });
    }

    return evaluator;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw createUnstablePublicApiError({
        httpCode: 409,
        code: "conflict",
        message:
          "Evaluator version changed during creation. Retry the request.",
      });
    }

    throw error;
  }
}

export async function deletePublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  // an evaluator in the public contract is the whole family; deleting it
  // removes all stored versions
  await deleteEvalTemplateFamily({
    prisma,
    projectId: params.projectId,
    evalTemplateId: params.evaluatorId,
    auditScope: params.auditScope,
    referencingEntityName: "evaluation rule",
  });
}
