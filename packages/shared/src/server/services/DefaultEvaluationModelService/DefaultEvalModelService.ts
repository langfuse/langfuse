import { EvaluatorBlockReason, Prisma } from "@prisma/client";
import z from "zod";
import { prisma } from "../../../db";
import { ForbiddenError, LangfuseNotFoundError } from "../../../errors";
import { getClientInitiatedNonStreamingLlmTimeoutMs } from "../../llm/llmText";
import { LLMAdapter, LLMApiKeySchema, ZodModelConfig } from "../../llm/types";
import { testModelCall } from "../../llm/testModelCall";
import {
  findCompatibleLlmApiKeysForProjects,
  resolveLlmApiKey,
} from "../LLMApiKeys";
import {
  blockEvaluatorsUsingDefaultModel,
  EvaluatorBlockSource,
  finalizeEvaluatorBlocks,
  type EvaluatorBlockResult,
} from "../blockEvaluators";

type ValidConfig = {
  provider: string;
  model: string;
  modelParams: z.infer<typeof ZodModelConfig>;
  adapter: LLMAdapter;
};

export class DefaultEvalModelService {
  /**
   * Gets the default evaluation model for a project
   */
  public static async fetchDefaultModel(projectId: string) {
    return prisma.defaultLlmModel.findUnique({
      where: {
        projectId,
      },
    });
  }

  /**
   * Creates or updates a default evaluation model for a project
   */
  public static async upsertDefaultModel(params: {
    projectId: string;
    provider: string;
    adapter: string;
    model: string;
    modelParams?: z.infer<typeof ZodModelConfig>;
  }) {
    const { projectId, provider, model, modelParams } = params;

    const llmApiKey = await resolveLlmApiKey({ projectId, provider });

    if (!llmApiKey) {
      throw new LangfuseNotFoundError(
        `API key for provider ${provider} in project ${projectId} not found`,
      );
    }

    try {
      if (LLMApiKeySchema.safeParse(llmApiKey).success) {
        // Make a test structured output call to validate the LLM key
        await testModelCall({
          provider,
          model,
          apiKey: llmApiKey as z.infer<typeof LLMApiKeySchema>,
          modelConfig: modelParams,
          timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new ForbiddenError(
        `Model configuration not valid for evaluation. ${message}`,
      );
    }

    // Create or update the default model
    return prisma.defaultLlmModel.upsert({
      where: {
        projectId,
      },
      update: {
        llmApiKeyId: llmApiKey.id,
        provider,
        adapter: llmApiKey.adapter,
        model,
        modelParams: modelParams ? modelParams : undefined,
      },
      create: {
        projectId,
        llmApiKeyId: llmApiKey.id,
        provider,
        adapter: llmApiKey.adapter,
        model,
        modelParams: modelParams ? modelParams : undefined,
      },
    });
  }

  /**
   * Keeps default-model references valid before an LLM connection is deleted.
   */
  public static async handleLlmApiKeyDeletion(params: {
    tx: Prisma.TransactionClient;
    llmApiKeyId: string;
    llmApiKeyOwner: {
      projectId: string | null;
      organizationId: string | null;
    };
    provider: string;
    adapter: string;
  }): Promise<
    Array<{ projectId: string; defaultModelBlock: EvaluatorBlockResult }>
  > {
    const { tx, llmApiKeyId, llmApiKeyOwner, provider, adapter } = params;
    const defaultModels = await tx.defaultLlmModel.findMany({
      where: {
        llmApiKeyId,
        LlmApiKey: llmApiKeyOwner,
      },
      select: { id: true, projectId: true },
    });

    if (defaultModels.length === 0) {
      return [];
    }

    const replacements = await findCompatibleLlmApiKeysForProjects({
      tx,
      projectIds: defaultModels.map(({ projectId }) => projectId),
      provider,
      adapter,
      excludedLlmApiKeyId: llmApiKeyId,
    });
    const modelsWithoutReplacement = [];
    for (const defaultModel of defaultModels) {
      const replacement = replacements.get(defaultModel.projectId);
      if (replacement) {
        await tx.defaultLlmModel.update({
          where: { id: defaultModel.id },
          data: { llmApiKeyId: replacement.id },
        });
      } else {
        modelsWithoutReplacement.push(defaultModel);
      }
    }

    const blockResults: Array<{
      projectId: string;
      defaultModelBlock: EvaluatorBlockResult;
    }> = [];
    for (const { projectId } of modelsWithoutReplacement) {
      blockResults.push({
        projectId,
        defaultModelBlock: await blockEvaluatorsUsingDefaultModel({
          tx,
          projectId,
        }),
      });
    }

    await tx.defaultLlmModel.deleteMany({
      where: {
        id: { in: modelsWithoutReplacement.map(({ id }) => id) },
      },
    });

    return blockResults;
  }

  /**
   * Keeps the default-model connection valid after a project changes organization.
   */
  public static async reconcileConnectionForProject(
    projectId: string,
  ): Promise<void> {
    const defaultModelBlock = await prisma.$transaction(async (tx) => {
      const defaultModel = await tx.defaultLlmModel.findUnique({
        where: { projectId },
        include: {
          Project: { select: { orgId: true } },
          LlmApiKey: {
            select: { projectId: true, organizationId: true },
          },
        },
      });
      if (!defaultModel) return null;

      const connectionIsAccessible =
        defaultModel.LlmApiKey.projectId === projectId ||
        defaultModel.LlmApiKey.organizationId === defaultModel.Project.orgId;
      if (connectionIsAccessible) return null;

      const replacements = await findCompatibleLlmApiKeysForProjects({
        tx,
        projectIds: [projectId],
        provider: defaultModel.provider,
        adapter: defaultModel.adapter,
        excludedLlmApiKeyId: defaultModel.llmApiKeyId,
      });
      const replacement = replacements.get(projectId);
      if (replacement) {
        await tx.defaultLlmModel.update({
          where: { id: defaultModel.id },
          data: { llmApiKeyId: replacement.id },
        });
        return null;
      }

      const block = await blockEvaluatorsUsingDefaultModel({ tx, projectId });
      await tx.defaultLlmModel.delete({ where: { id: defaultModel.id } });
      return block;
    });

    if (defaultModelBlock) {
      await finalizeEvaluatorBlocks({
        projectId,
        source: EvaluatorBlockSource.DEFAULT_EVAL_MODEL_DELETION,
        evaluatorIdsByReason: {
          [EvaluatorBlockReason.DEFAULT_EVAL_MODEL_MISSING]:
            defaultModelBlock.blockedEvaluatorIds,
        },
      });
    }
  }

  /**
   * Simple validation that can also be used client side
   * Validates if the provider, model, and model parameters are valid
   */
  public static validateModelConfig(config: {
    provider?: string;
    model?: string;
    modelParams?: unknown;
  }): config is ValidConfig {
    const errors: string[] = [];

    if (!config.provider || !config.model) {
      return false;
    }

    // Validate model parameters
    if (config.modelParams) {
      const result = ZodModelConfig.safeParse(config.modelParams);
      if (!result.success) {
        errors.push(
          ...result.error.issues.map(
            (err) => `Model parameter error: ${err.message}`,
          ),
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Validate model config against available API keys
   * Checks if the provider and model are valid and an API key exists
   */
  public static async fetchValidModelConfig(
    projectId: string,
    provider?: string,
    model?: string,
    modelParams?: unknown,
  ): Promise<
    | {
        valid: true;
        config: {
          provider: string;
          model: string;
          modelParams?: z.infer<typeof ZodModelConfig>;
          apiKey: z.infer<typeof LLMApiKeySchema>;
          adapter: LLMAdapter;
        };
      }
    | {
        valid: false;
        error: string;
      }
  > {
    let selectedModel: ValidConfig | null = null;
    // Basic validation first
    const config = {
      provider,
      model,
      modelParams,
    };
    const basicValidation = this.validateModelConfig(config);

    if (basicValidation) {
      selectedModel = config;
    }

    if (!selectedModel) {
      // fetch default model
      const defaultModel = await this.fetchDefaultModel(projectId);
      const defaultConfig = {
        provider: defaultModel?.provider,
        model: defaultModel?.model,
        modelParams: defaultModel?.modelParams,
      };
      const basicValidation = this.validateModelConfig(defaultConfig);

      if (basicValidation) {
        selectedModel = defaultConfig;
      }
    }

    if (!selectedModel) {
      return {
        valid: false,
        error: `No default model or custom model configured for project ${projectId}`,
      };
    }

    const apiKey = await resolveLlmApiKey({
      projectId,
      provider: selectedModel.provider,
    });

    const parsedKey = LLMApiKeySchema.safeParse(apiKey);

    if (!parsedKey.success) {
      return {
        valid: false,
        error: `API key for provider "${selectedModel.provider}" not found in project ${projectId}`,
      };
    }

    return {
      valid: true,
      config: {
        ...selectedModel,
        apiKey: parsedKey.data,
        adapter: parsedKey.data.adapter,
      },
    };
  }
}
