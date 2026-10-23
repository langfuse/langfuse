import { Button } from "@/src/components/design-system/Button/Button";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type RouterOutputs } from "@/src/utils/api";
import { TopicsErrorMessage } from "./TopicsErrorMessage";
import {
  estimatedExecutionCost,
  executionLabels,
  operationLabels,
} from "./topic-run-labels";

export function TopicRunHistoryList({
  executions,
  errorMessage,
  onOpen,
  onRefresh,
}: TopicRunHistoryListProps) {
  return (
    <>
      <div className="self-end">
        <Button
          text="Refresh"
          size="sm"
          variant="ghost"
          onClick={() => onRefresh()}
        />
      </div>
      {errorMessage && <TopicsErrorMessage message={errorMessage} />}
      {!executions.length && (
        <p className="text-muted-foreground text-sm">
          Your triggered batches will appear here.
        </p>
      )}
      {executions.map((execution) => (
        <button
          key={execution.id}
          onClick={() => onOpen(execution.id)}
          className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-left text-sm"
        >
          <span className="capitalize">
            {operationLabels[execution.input.operation]} ·{" "}
            {new Date(execution.createdAt).toLocaleString()}
          </span>
          <span>{execution.facets.length} facets</span>
          <Badge text={executionLabels[execution.status]} />
          {execution.input.operation === "process" && (
            <span className="text-muted-foreground w-full tabular-nums">
              Estimated cost: {estimatedExecutionCost(execution.estimatedCost)}
            </span>
          )}
        </button>
      ))}
    </>
  );
}

type TopicRunHistoryListProps = {
  executions: RouterOutputs["topics"]["executions"];
  errorMessage?: string;
  onOpen: (executionId: string) => void;
  onRefresh: () => void;
};
