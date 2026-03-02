import z from "zod/v4";
import { Prisma, prisma } from "../../../db";
import { ForbiddenError, LangfuseNotFoundError } from "../../../errors";
import { LLMApiKeySchema, ZodModelConfig } from "../../llm/types";
import { testModelCall } from "../../llm/testModelCall";
import { clearNoEvalConfigsCache } from "../../evalJobConfigCache";

type ValidConfig = {
  provider: string;
  model: string;
  modelParams: z.infer<typeof ZodModelConfig>;
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
    const { projectId, provider, adapter, model, modelParams } = params;

    // Find the LLM API key for the provider
    const llmApiKey = await prisma.llmApiKeys.findFirst({
      where: {
        projectId,
        provider,
      },
    });

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
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      throw new ForbiddenError(
        `Model configuration not valid for evaluation. ${message}`,
      );
    }

    await prisma.llmApiKeys.update({
      where: { id: llmApiKey.id },
      data: { lastError: Prisma.JsonNull },
    });

    // Create or update the default model
    const defaultModel = await prisma.defaultLlmModel.upsert({
      where: {
        projectId,
      },
      update: {
        llmApiKeyId: llmApiKey.id,
        provider,
        adapter,
        model,
        modelParams: modelParams ? modelParams : undefined,
      },
      create: {
        projectId,
        llmApiKeyId: llmApiKey.id,
        provider,
        adapter,
        model,
        modelParams: modelParams ? modelParams : undefined,
      },
    });

    // Only re-enable project-scoped templates; global templates are never set to ERROR.
    const errorTemplatesUsingDefault = await prisma.evalTemplate.findMany({
      where: {
        projectId,
        provider: null,
        model: null,
        status: "ERROR",
      },
      select: { id: true },
    });
    const templateIds = errorTemplatesUsingDefault.map((t) => t.id);
    if (templateIds.length > 0) {
      const now = new Date();
      await prisma.evalTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: {
          status: "OK",
          statusReason: Prisma.JsonNull,
          statusUpdatedAt: now,
        },
      });
      await clearNoEvalConfigsCache(projectId, "traceBased");
      await clearNoEvalConfigsCache(projectId, "eventBased");
    }

    return defaultModel;
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

    // Check if API key exists for this provider
    const apiKey = await prisma.llmApiKeys.findFirst({
      where: {
        projectId,
        provider: selectedModel.provider,
      },
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
      },
    };
  }
}
