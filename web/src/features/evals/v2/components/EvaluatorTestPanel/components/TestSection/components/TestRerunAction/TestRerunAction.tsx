import { TestRerunButton } from "../../../../../Evaluators/Testing/components/TestRerunButton/TestRerunButton";
import { useEvaluatorTestAvailability } from "../../../../../../hooks/useEvaluatorTestAvailability";
import type { EvaluatorSetupStore } from "../../../../../../store/evaluatorSetupStore/evaluatorSetupStore";

export function TestRerunAction({
  projectId,
  store,
  hasValidModel,
  isPending,
  onRerun,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  hasValidModel: boolean;
  isPending: boolean;
  onRerun: () => void;
}) {
  const disabledReason = useEvaluatorTestAvailability({
    projectId,
    store,
    hasValidModel,
  });

  return (
    <TestRerunButton
      isPending={isPending}
      disabledReason={disabledReason}
      onRerun={onRerun}
    />
  );
}
