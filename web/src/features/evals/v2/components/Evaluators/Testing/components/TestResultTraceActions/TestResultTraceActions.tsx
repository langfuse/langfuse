import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { ExternalLink, MoreVertical } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";

export const TestResultTraceActionsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button>
>(function TestResultTraceActionsTrigger({ title = "More", ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-xs"
      title={title}
    >
      <MoreVertical className="h-3.5 w-3.5" />
    </Button>
  );
});

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
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            Open execution trace
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
