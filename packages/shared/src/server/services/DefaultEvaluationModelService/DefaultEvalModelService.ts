import z from "zod";
import { prisma } from "../../../db";
import { InvalidRequestError, LangfuseNotFoundError } from "../../../errors";
import { LLMApiKeySchema, ZodModelConfig } from "../../llm/types";

// Define return types for validation functions
export type ValidationResult = {
  valid: boolean;
  errors?: string[];
};

export class DefaultEvalModelService {
  /**
   * Gets the default evaluation model for a project
   */
  public static async fetchDefaultModel(projectId: string) {
    return prisma.defaultEvalModel.findUnique({
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
    modelParams?: Record<string, unknown>;
  }) {
    const { projectId, provider, adapter, model, modelParams } = params;

    // Validate the provider and model
    const validationResult = this.validateModelConfig(
      provider,
      model,
      modelParams,
    );
    if (!validationResult.valid) {
      throw new InvalidRequestError(
        `Invalid model configuration: ${validationResult.errors?.join(", ")}`,
      );
    }

    // Find the LLM API key for the provider
    const llmApiKey = await prisma.llmApiKeys.findFirst({
      where: {
        projectId,
        provider,
      },
    });

    if (!llmApiKey) {
      throw new LangfuseNotFoundError(
        `No API key found for provider ${provider} in project ${projectId}`,
      );
    }

    // Create or update the default model
    return prisma.defaultEvalModel.upsert({
      where: {
        projectId,
      },
      update: {
        llmApiKeyId: llmApiKey.id,
        provider,
        adapter,
        model,
        modelParams: modelParams ? (modelParams as any) : {},
      },
      create: {
        projectId,
        llmApiKeyId: llmApiKey.id,
        provider,
        adapter,
        model,
        modelParams: modelParams ? (modelParams as any) : {},
      },
    });
  }

  /**
   * Deletes the default evaluation model for a project
   */
  public static async deleteDefaultModel(projectId: string) {
    return prisma.defaultEvalModel.delete({
      where: {
        projectId,
      },
    });
  }

  /**
   * Simple validation
   * Validates if the provider, model, and model parameters are valid
   */
  public static validateModelConfig(
    provider?: string,
    model?: string,
    modelParams?: Record<string, unknown>,
  ): ValidationResult {
    const errors: string[] = [];

    if (!provider || !model) {
      return {
        valid: false,
        errors: ["Provider and model are required"],
      };
    }

    // Validate model parameters
    if (modelParams) {
      const result = ZodModelConfig.safeParse(modelParams);
      if (!result.success) {
        errors.push(
          ...result.error.errors.map(
            (err) => `Model parameter error: ${err.message}`,
          ),
        );
        return { valid: false, errors };
      }
    }

    return { valid: true };
  }

  /**
   * Validate model config against available API keys
   * Checks if the provider and model are valid and an API key exists
   */
  public static async fetchValidModelConfig(
    projectId: string,
    provider?: string,
    model?: string,
    modelParams?: Record<string, unknown> | null,
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
    let selectedModel = null;
    // Basic validation first
    const basicValidation = this.validateModelConfig(
      provider,
      model,
      modelParams ?? {},
    );
    if (basicValidation.valid) {
      selectedModel = {
        provider: provider as string,
        model: model as string,
        modelParams: modelParams as z.infer<typeof ZodModelConfig>,
      };
    }

    if (!selectedModel) {
      // fetch default model
      const defaultModel = await this.fetchDefaultModel(projectId);
      if (defaultModel) {
        selectedModel = {
          provider: defaultModel.provider,
          model: defaultModel.model,
          modelParams: defaultModel.modelParams as z.infer<
            typeof ZodModelConfig
          >,
        };
      }
    }

    if (!selectedModel) {
      return {
        valid: false,
        error: `No default model or custom model found for project ${projectId}.`,
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
        error: `No API key found for provider "${selectedModel.provider}" in project ${projectId}.`,
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
