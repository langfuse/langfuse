import {
  extractVariables,
  InternalServerError,
  observationVariableMappingList,
  variableMappingList,
} from "@langfuse/shared";
import { invalidateProjectEvalConfigCaches } from "@langfuse/shared/src/server";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import { z } from "zod";
import type { PostUnstableEvaluatorBodyType } from "@/src/features/public-api/types/unstable-evaluators";
import {
  toApiEvaluator,
  toStoredModelConfig,
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

function prepareVariableMappingForEvaluatorUpgrade(params: {
  scoreName: string;
  variableMapping: unknown;
  nextVariables: string[];
}) {
  const mappingParseResult = z
    .union([observationVariableMappingList, variableMappingList])
    .safeParse(params.variableMapping);

  if (!mappingParseResult.success) {
    throw new InternalServerError("Evaluation rule mapping is corrupted");
  }

  const migratedVariableMapping = mappingParseResult.data.filter((mapping) =>
    params.nextVariables.includes(mapping.templateVariable),
  );
  const mappedVariables = new Set(
    migratedVariableMapping.map((mapping) => mapping.templateVariable),
  );
  const missingVariables = params.nextVariables.filter(
    (variable) => !mappedVariables.has(variable),
  );

  if (missingVariables.length > 0) {
    throw createUnstablePublicApiError({
      httpCode: 409,
      code: "conflict",
      message: `Creating a new evaluator version would invalidate the evaluation rule "${params.scoreName}" because it is missing mappings for new evaluator variables: ${missingVariables.join(", ")}.`,
      details: {
        field: "mapping",
        variables: missingVariables,
      },
    });
  }

  return migratedVariableMapping;
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
  input: PostUnstableEvaluatorBodyType;
}) {
  const storedOutputDefinition = toStoredOutputDefinition(
    params.input.outputDefinition,
  );

  await assertEvaluatorDefinitionCanRunForPublicApi({
    projectId: params.projectId,
    template: {
      name: params.input.name,
      provider: params.input.modelConfig?.provider ?? null,
      model: params.input.modelConfig?.model ?? null,
      outputDefinition: storedOutputDefinition,
    },
  });

  try {
    const { template, upgradedConfigCount } = await prisma.$transaction(
      async (tx) => {
        const existingProjectTemplates = await tx.evalTemplate.findMany({
          where: {
            projectId: params.projectId,
            name: params.input.name,
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
        const nextVariables = extractVariables(params.input.prompt);
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
                },
                select: {
                  id: true,
                  scoreName: true,
                  variableMapping: true,
                },
              })
            : [];
        const upgradedConfigs = configsToUpgrade.map((config) => ({
          id: config.id,
          variableMapping: prepareVariableMappingForEvaluatorUpgrade({
            scoreName: config.scoreName,
            variableMapping: config.variableMapping,
            nextVariables,
          }),
        }));
        const modelConfig = toStoredModelConfig(params.input.modelConfig);
        const latestProjectTemplate = existingProjectTemplates[0];

        const template = await tx.evalTemplate.create({
          data: {
            projectId: params.projectId,
            name: params.input.name,
            version: (latestProjectTemplate?.version ?? 0) + 1,
            prompt: params.input.prompt,
            provider: modelConfig.provider,
            model: modelConfig.model,
            modelParams: modelConfig.modelParams,
            vars: nextVariables,
            outputDefinition: storedOutputDefinition,
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

    return toApiEvaluator({
      template: template as StoredPublicEvaluatorTemplate,
      evaluationRuleCount,
    });
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
