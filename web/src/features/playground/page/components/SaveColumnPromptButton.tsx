import React from "react";
import { SaveIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useMultiPlaygroundContext } from "../context/multi-playground-context";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type ChatMessage, PromptType } from "@langfuse/shared";

interface SaveColumnPromptButtonProps {
  columnId: string;
}

export const SaveColumnPromptButton: React.FC<SaveColumnPromptButtonProps> = ({
  columnId,
}) => {
  const { state } = useMultiPlaygroundContext();
  const projectId = useProjectIdFromURL();
  const router = useRouter();
  const capture = usePostHogClientCapture();
  
  const column = state.columns.find(c => c.id === columnId);
  if (!column) return null;

  const createPromptMutation = api.prompts.create.useMutation({
    onSuccess: (data) => {
      capture("playground:save_to_new_prompt_button_click", { projectId });
      void router.push(
        `/project/${projectId}/prompts/${encodeURIComponent(data.name)}`,
      );
    },
    onError: (error) => {
      console.error(error);
      // TODO: Add toast notification for error
    },
  });

  const handleSave = () => {
    if (!column.modelParams.provider.value || !column.modelParams.model.value) {
      alert("Please select a model before saving");
      return;
    }

    // Convert messages to the format expected by the API
    const promptMessages = column.messages.map(msg => {
      // Remove the id field and keep the rest
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...messageWithoutId } = msg;
      return messageWithoutId as ChatMessage;
    });

    // Build config object with model parameters
    const config: Record<string, unknown> = {
      modelProvider: column.modelParams.provider.value,
      modelName: column.modelParams.model.value,
      modelParameters: {
        temperature: column.modelParams.temperature.enabled
          ? column.modelParams.temperature.value
          : undefined,
        max_tokens: column.modelParams.max_tokens.enabled
          ? column.modelParams.max_tokens.value
          : undefined,
        top_p: column.modelParams.top_p.enabled
          ? column.modelParams.top_p.value
          : undefined,
      },
    };

    if (column.tools.length > 0) {
      config.tools = column.tools;
    }

    if (column.structuredOutputSchema) {
      config.structuredOutputSchema = column.structuredOutputSchema.schema;
    }

    createPromptMutation.mutate({
      projectId: projectId as string,
      name: `Playground ${new Date().toISOString()}`,
      type: PromptType.Chat,
      prompt: promptMessages,
      config,
      labels: ["production"],
    });
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0"
      onClick={handleSave}
      disabled={createPromptMutation.isLoading}
      title="Save this column as prompt"
    >
      <SaveIcon className="h-3.5 w-3.5" />
    </Button>
  );
};