import { TestRerunButton } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestRerunButton/TestRerunButton";
import { useEvaluatorTestAvailability } from "@/src/features/evals/v2/hooks/useEvaluatorTestAvailability";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

export function TestRerunAction({
  projectId,
  store,
  isPending,
  onRerun,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  isPending: boolean;
  onRerun: () => void;
}) {
  const disabledReason = useEvaluatorTestAvailability({ projectId, store });

  return (
    <TestRerunButton
      isPending={isPending}
      disabledReason={disabledReason}
      onRerun={onRerun}
    />
  );
}
