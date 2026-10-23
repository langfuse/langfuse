import { DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { MoreVertical } from "@langfuse/icons";
import { TestResultTraceActions } from "@/src/features/evals/v2/components/Evaluators/Testing/components/TestResultTraceActions/TestResultTraceActions";

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
        <Button type="button" variant="ghost" size="icon-xs" title="More">
          <MoreVertical size="sm" color="default" />
        </Button>
      </DropdownMenuTrigger>
    </TestResultTraceActions>
  );
}
