import { useEvaluatorPromptSample } from "@/src/features/evals/v2/hooks/useEvaluatorPromptSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { PromptEditorContent } from "./PromptEditorContent";

export function PromptEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const sampleObject = useEvaluatorPromptSample({ projectId, store });
  return <PromptEditorContent store={store} sampleObject={sampleObject} />;
}
