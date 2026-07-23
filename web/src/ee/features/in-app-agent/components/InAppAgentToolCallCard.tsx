"use client";

import { Check, Loader2, Wrench } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { InAppAgentToolPayload } from "./InAppAgentToolPayload";
import { InAppAgentToolResultPayload } from "./InAppAgentToolResultPayload";
import { type InAppAgentToolCallContent } from "@/src/ee/features/in-app-agent/components/utils/utils";

export function InAppAgentToolCallCard({
  tool,
  isCompact = false,
  isDisabled = false,
  onApproveToolCall,
  onRejectToolCall,
}: {
  tool: InAppAgentToolCallContent;
  isCompact?: boolean;
  isDisabled?: boolean;
  onApproveToolCall?: (approvalId: string) => Promise<void>;
  onRejectToolCall?: (approvalId: string) => Promise<void>;
}) {
  const approval = tool.approval;
  const isApprovalPending = approval?.status === "pending";
  const isApprovalSubmitting = approval?.status === "submitting";
  const approveLabel = `Approve ${tool.name}?`;
  const usedLabel = `Used ${tool.name}`;

  return (
    <div
      className={cn(
        "bg-card text-foreground border-border rounded-2xl border shadow-xs",
        isCompact
          ? "rounded-xl px-2.5 py-2 text-[0.775rem]"
          : "px-3 py-2.5 text-sm",
      )}
    >
      {approval ? (
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs leading-none font-bold">
            <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <span
              className="min-w-0 flex-1 truncate py-0.5"
              title={approveLabel}
            >
              {approveLabel}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            <InAppAgentToolPayload
              label="Arguments"
              value={tool.args}
              variant="default"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline-success"
                className="h-7"
                disabled={
                  isDisabled || isApprovalSubmitting || !onApproveToolCall
                }
                onClick={() => {
                  if (isApprovalPending) {
                    onApproveToolCall?.(approval.id).catch(() => undefined);
                  }
                }}
              >
                {isApprovalSubmitting ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Check className="mr-1 size-3" />
                )}
                Confirm
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={
                  isDisabled || isApprovalSubmitting || !onRejectToolCall
                }
                onClick={() => {
                  if (isApprovalPending) {
                    onRejectToolCall?.(approval.id).catch(() => undefined);
                  }
                }}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <details className="group/tool min-w-0">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs leading-none font-bold [&::-webkit-details-marker]:hidden">
            <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate py-0.5" title={usedLabel}>
              {usedLabel}
            </span>
            <span className="text-muted-foreground text-xs group-open/tool:hidden">
              Show
            </span>
            <span className="text-muted-foreground hidden text-xs group-open/tool:inline">
              Hide
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            <InAppAgentToolPayload
              label="Arguments"
              value={tool.args}
              variant="default"
            />
            <InAppAgentToolResultPayload tool={tool} />
          </div>
        </details>
      )}
    </div>
  );
}
