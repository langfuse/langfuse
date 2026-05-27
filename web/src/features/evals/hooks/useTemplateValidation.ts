import { useEffect } from "react";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { type EvalTemplate } from "@langfuse/shared/src/db";
import { useIsCodeEvalEnabled } from "@/src/features/evals/hooks/useIsCodeEvalEnabled";
import { isCodeEvalTemplate } from "@/src/features/evals/utils/code-eval-template-utils";

export function useTemplateValidation({
  projectId,
  onValidSelection,
}: {
  projectId: string;
  onValidSelection?: (template: EvalTemplate) => void;
}) {
  const { enabled: isCodeEvalEnabled } = useIsCodeEvalEnabled();
  const [selectedTemplate, setSelectedTemplate] = useState<EvalTemplate | null>(
    null,
  );
  const [isSelectionValid, setIsSelectionValid] = useState(true);

  const defaultModel = api.defaultLlmModel.fetchDefaultModel.useQuery({
    projectId,
  });

  // validate that either a default eval model is set or the selected eval has a custom model
  useEffect(() => {
    if (selectedTemplate) {
      if (isCodeEvalTemplate(selectedTemplate)) {
        setIsSelectionValid(isCodeEvalEnabled);
        if (isCodeEvalEnabled) {
          onValidSelection?.(selectedTemplate);
        }
        return;
      }

      if (!(selectedTemplate.provider || defaultModel.data?.provider)) {
        setIsSelectionValid(false);
        return;
      }

      if (!(selectedTemplate.model || defaultModel.data?.model)) {
        setIsSelectionValid(false);
        return;
      }
      setIsSelectionValid(true);

      // Trigger callback when template becomes valid
      onValidSelection?.(selectedTemplate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate?.id, onValidSelection, isCodeEvalEnabled]);

  return { isSelectionValid, selectedTemplate, setSelectedTemplate };
}
