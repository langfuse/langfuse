/* eslint-disable @repo/no-null-render */
import { DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import {
  TestResultTraceActions,
  TestResultTraceActionsTrigger,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActions/TestResultTraceActions";

export function TestResultActions({
  executionTraceId,
  onOpenExecutionTrace,
}: {
  executionTraceId: string | null;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  return executionTraceId ? (
    <TestResultTraceActions
      executionTraceId={executionTraceId}
      onOpenExecutionTrace={onOpenExecutionTrace}
    >
      <DropdownMenuTrigger asChild>
        <TestResultTraceActionsTrigger />
      </DropdownMenuTrigger>
    </TestResultTraceActions>
  ) : null;
}
