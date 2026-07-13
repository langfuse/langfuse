import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useInAppAiAgent } from "./InAppAiAgentProvider";

export function InAppAgentExplainErrorButton({
  traceId,
  observationId,
  label = "Explain error",
}: {
  traceId: string;
  observationId?: string;
  label?: string;
}) {
  const { isAvailable, startAssistantRun } = useInAppAiAgent();

  if (!isAvailable) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await startAssistantRun({
          source: "trace_error",
          traceId,
          observationId,
        });
      }}
    >
      <BotMessageSquare className="mr-1 h-4 w-4" />
      {label}
    </Button>
  );
}

export function InAppAgentAnalyzeSelectionButton({
  traceIds,
  observationIds,
  selectAll = false,
}: {
  traceIds: string[];
  observationIds: string[];
  selectAll?: boolean;
}) {
  const { isAvailable, startAssistantRun } = useInAppAiAgent();
  const selectedCount = new Set(
    observationIds.length > 0 ? observationIds : traceIds,
  ).size;
  const isDisabled = selectAll || selectedCount === 0 || selectedCount > 20;

  if (!isAvailable) {
    return null;
  }

  const button = (
    <Button
      variant="outline"
      size="sm"
      className="h-8"
      disabled={isDisabled}
      onClick={async () => {
        await startAssistantRun({
          source: "trace_selection",
          traceIds,
          observationIds,
        });
      }}
    >
      <BotMessageSquare className="mr-1 h-4 w-4" />
      <span className="hidden sm:inline">Analyze with Assistant</span>
    </Button>
  );

  if (!isDisabled) {
    return button;
  }

  const explanation = selectAll
    ? "Select up to 20 individual traces or observations to analyze."
    : selectedCount > 20
      ? "The assistant can analyze up to 20 selected traces or observations."
      : "Select at least one trace or observation to analyze.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}
