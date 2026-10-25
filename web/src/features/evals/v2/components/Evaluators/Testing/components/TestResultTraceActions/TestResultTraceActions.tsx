import { type ReactNode } from "react";
import { ExternalLink } from "@langfuse/icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";

export function TestResultTraceActions({
  children,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  children: ReactNode;
  executionTraceId: string | null;
  onOpenExecutionTrace: ((executionTraceId: string) => void) | null;
}) {
  const openExecutionTrace =
    executionTraceId && onOpenExecutionTrace
      ? () => onOpenExecutionTrace(executionTraceId)
      : null;

  return (
    <DropdownMenu>
      {children}
      <DropdownMenuContent align="end">
        {openExecutionTrace ? (
          <DropdownMenuItem onClick={openExecutionTrace}>
            <ExternalLink size="base" color="default" __rawClassName="mr-2" />
            Open execution trace
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
