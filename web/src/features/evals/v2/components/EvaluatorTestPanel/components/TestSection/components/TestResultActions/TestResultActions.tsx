import {
  TestResultTraceActionsDropdownMenu,
  TestResultTraceActionsTrigger,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActionsDropdownMenu/TestResultTraceActionsDropdownMenu";

export function TestResultActions({
  executionTraceId,
  onOpenExecutionTrace,
}: {
  executionTraceId: string;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  return (
    <TestResultTraceActionsDropdownMenu
      executionTraceId={executionTraceId}
      onOpenExecutionTrace={onOpenExecutionTrace}
    >
      {({ getTriggerProps }) => (
        <TestResultTraceActionsTrigger {...getTriggerProps()} />
      )}
    </TestResultTraceActionsDropdownMenu>
  );
}
