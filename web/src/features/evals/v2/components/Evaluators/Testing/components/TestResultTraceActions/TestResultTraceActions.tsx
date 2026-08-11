import type { ReactNode } from "react";
import { ExternalLink, MoreVertical } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";

export function TestResultTraceActionsTrigger() {
  return (
    <Button type="button" variant="ghost" size="icon-xs" title="More">
      <MoreVertical className="h-3.5 w-3.5" />
    </Button>
  );
}

export function TestResultTraceActions({
  children,
  onOpenSampleTrace,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  children: ReactNode;
  onOpenSampleTrace: (() => void) | null;
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
        {onOpenSampleTrace ? (
          <DropdownMenuItem onClick={onOpenSampleTrace}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Open sample trace
          </DropdownMenuItem>
        ) : null}
        {openExecutionTrace ? (
          <DropdownMenuItem onClick={openExecutionTrace}>
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Open execution trace
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
