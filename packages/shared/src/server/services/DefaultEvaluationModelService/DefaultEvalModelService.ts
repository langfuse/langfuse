import z from "zod/v4";
import { prisma } from "../../../db";
import { LangfuseNotFoundError, QUEUE_ERROR_MESSAGES } from "../../../errors";
import { LLMApiKeySchema, ZodModelConfig } from "../../llm/types";

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

    // Create or update the default model
    return prisma.defaultLlmModel.upsert({
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
        error: `${QUEUE_ERROR_MESSAGES.NO_DEFAULT_MODEL_ERROR} ${projectId}.`,
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
        error: `${QUEUE_ERROR_MESSAGES.API_KEY_ERROR} "${selectedModel.provider}" not found in project ${projectId}.`,
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
