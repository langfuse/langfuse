import { PromptEditor } from "./PromptEditor";
import { useEvaluatorSetupSample } from "@/src/features/evals/v2/hooks/useEvaluatorSetupSample";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function ConnectedPromptEditor({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const sampleObject = useEvaluatorSetupSample({ projectId, store });
  return <PromptEditor store={store} sampleObject={sampleObject} />;
}
