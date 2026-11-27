/* eslint-disable @repo/component-file-structure */
import { forwardRef, type ComponentProps } from "react";
import { SquareArrowOutUpRight, MoreVertical } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";

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
      <MoreVertical size="sm" color="default" />
    </Button>
  );
});

export function TestResultTraceActionsDropdownMenu({
  children,
  executionTraceId,
  onOpenExecutionTrace,
}: {
  children: ComponentProps<typeof DropdownMenu>["children"];
  executionTraceId: string | null;
  onOpenExecutionTrace: ((executionTraceId: string) => void) | null;
}) {
  const openExecutionTrace =
    executionTraceId && onOpenExecutionTrace
      ? () => onOpenExecutionTrace(executionTraceId)
      : null;

  return (
    <DropdownMenu
      placement="bottom-end"
      items={
        openExecutionTrace
          ? [
              {
                type: "item",
                id: "open-execution-trace",
                title: "Open execution trace",
                icon: SquareArrowOutUpRight,
                onClick: openExecutionTrace,
              },
            ]
          : []
      }
    >
      {children}
    </DropdownMenu>
  );
}
