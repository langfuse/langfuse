import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type UseFormReturn } from "react-hook-form";
import {
  extractVariables,
  PromptType,
  extractPlaceholderNames,
  type PromptMessage,
  ZodModelConfig,
} from "@langfuse/shared";
import { z } from "zod/v4";

type ExperimentPromptDataProps = {
  projectId: string;
  form: UseFormReturn<any>;
};

export type ExperimentPromptModelConfig = {
  provider?: string;
  model: string;
};

export function useExperimentPromptData({
  projectId,
  form,
}: ExperimentPromptDataProps) {
  const promptId = form.watch("promptId");

  const promptMeta = api.prompts.allPromptMeta.useQuery({
    projectId,
  });

  const expectedColumns = useMemo(() => {
    const prompt = promptMeta.data?.find((p) => p.id === promptId);
    if (!prompt) return [];

    const extractedVariables = extractVariables(
      prompt.type === PromptType.Text
        ? (prompt?.prompt?.toString() ?? "")
        : JSON.stringify(prompt?.prompt),
    );

    const promptMessages =
      prompt?.type === PromptType.Chat && Array.isArray(prompt.prompt)
        ? prompt.prompt
        : [];
    const placeholderNames = extractPlaceholderNames(
      promptMessages as PromptMessage[],
    );

    return [...extractedVariables, ...placeholderNames];
  }, [promptId, promptMeta.data]);

  const promptsByName = useMemo(
    () =>
      promptMeta.data?.reduce<
        Record<string, Array<{ version: number; id: string; labels: string[] }>>
      >((acc, prompt) => {
        if (!acc[prompt.name]) {
          acc[prompt.name] = [];
        }
        acc[prompt.name].push({
          version: prompt.version,
          id: prompt.id,
          labels: prompt.labels,
        });
        return acc;
      }, {}),
    [promptMeta.data],
  );

  const selectedPromptModelConfig = useMemo(() => {
    const prompt = promptMeta.data?.find((p) => p.id === promptId);
    return getPromptModelConfig(prompt?.config);
  }, [promptId, promptMeta.data]);

  return {
    expectedColumns,
    promptsByName,
    promptId,
    selectedPromptModelConfig,
  };
}

const PromptConfigSchema = ZodModelConfig.extend({
  provider: z.string().min(1).optional(),
  model: z.string().min(1),
});

const getPromptModelConfig = (
  config: unknown,
): ExperimentPromptModelConfig | null => {
  const parsedConfig = PromptConfigSchema.safeParse(config);

  if (!parsedConfig.success) return null;

  const { provider, model } = parsedConfig.data;
  return {
    ...(provider ? { provider } : {}),
    model,
  };
};
