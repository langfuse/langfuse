import { DropdownMenuTrigger } from "@/src/app/design-system/legacy-primitives/dropdown-menu";
import {
  TestResultTraceActions,
  TestResultTraceActionsTrigger,
} from "@/src/evaluators/v2/components/Evaluators/Testing/components/TestResultTraceActions/TestResultTraceActions";

export function TestResultActions({
  executionTraceId,
  onOpenExecutionTrace,
}: {
  executionTraceId: string;
  onOpenExecutionTrace: (traceId: string) => void;
}) {
  return (
    <TestResultTraceActions
      executionTraceId={executionTraceId}
      onOpenExecutionTrace={onOpenExecutionTrace}
    >
      <DropdownMenuTrigger asChild>
        <TestResultTraceActionsTrigger />
      </DropdownMenuTrigger>
    </TestResultTraceActions>
  );
}
