import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { type UseFormReturn } from "react-hook-form";
import {
  extractPlaceholderNames,
  type PromptMessage,
} from "@langfuse/shared/server/llm/compileChatMessages";
import { PromptType } from "@langfuse/shared/features/prompts";
import { extractVariables } from "@langfuse/shared/utils";

type ExperimentPromptDataProps = {
  projectId: string;
  form: UseFormReturn<any>;
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
        Record<string, Array<{ version: number; id: string }>>
      >((acc, prompt) => {
        if (!acc[prompt.name]) {
          acc[prompt.name] = [];
        }
        acc[prompt.name].push({ version: prompt.version, id: prompt.id });
        return acc;
      }, {}),
    [promptMeta.data],
  );

  return {
    expectedColumns,
    promptsByName,
    promptId,
  };
}
