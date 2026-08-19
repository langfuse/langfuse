"use client";

import { useState } from "react";
import { Check, Loader2, Wrench } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { InAppAgentToolCallDetails } from "./InAppAgentToolCallDetails";
import {
  getInAppAgentToolDisplayName,
  type InAppAgentToolCallContent,
} from "@/src/features/in-app-agent/components/utils/utils";

export function InAppAgentToolCallCard({
  tool,
  isCompact = false,
  isDisabled = false,
  onApproveToolCall,
  onAlwaysAllowToolCall,
  onRejectToolCall,
}: {
  tool: InAppAgentToolCallContent;
  isCompact?: boolean;
  isDisabled?: boolean;
  onApproveToolCall?: (approvalId: string) => Promise<void>;
  onAlwaysAllowToolCall?: (approvalId: string) => Promise<void>;
  onRejectToolCall?: (approvalId: string) => Promise<void>;
}) {
  const [activeDecision, setActiveDecision] = useState<
    "once" | "conversation" | "reject" | null
  >(null);
  const approval = tool.approval;
  const isApprovalPending = approval?.status === "pending";
  const isApprovalSubmitting = approval?.status === "submitting";
  const isDecisionSubmitting = isApprovalSubmitting || activeDecision !== null;
  const displayName = getInAppAgentToolDisplayName(tool.name);
  const approveLabel = `Approve ${displayName}?`;
  const usedLabel = `Used ${displayName}`;

  const decide = async (
    decision: NonNullable<typeof activeDecision>,
    handler: ((approvalId: string) => Promise<void>) | undefined,
  ) => {
    if (!approval || !isApprovalPending || isDecisionSubmitting || !handler) {
      return;
    }

    setActiveDecision(decision);
    try {
      await handler(approval.id);
    } finally {
      setActiveDecision(null);
    }
  };

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
            <InAppAgentToolCallDetails tool={tool} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline-success"
                className="h-7"
                disabled={
                  isDisabled || isDecisionSubmitting || !onApproveToolCall
                }
                aria-busy={activeDecision === "once"}
                onClick={() => {
                  decide("once", onApproveToolCall).catch(() => undefined);
                }}
              >
                {activeDecision === "once" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : (
                  <Check className="mr-1 size-3" />
                )}
                Approve
              </Button>
              {onAlwaysAllowToolCall ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  title={`Always approve ${displayName} for this conversation`}
                  aria-label="Always approve for this conversation"
                  disabled={isDisabled || isDecisionSubmitting}
                  aria-busy={activeDecision === "conversation"}
                  onClick={() => {
                    decide("conversation", onAlwaysAllowToolCall).catch(
                      () => undefined,
                    );
                  }}
                >
                  {activeDecision === "conversation" ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : null}
                  Always approve*
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                disabled={
                  isDisabled || isDecisionSubmitting || !onRejectToolCall
                }
                aria-busy={activeDecision === "reject"}
                onClick={() => {
                  decide("reject", onRejectToolCall).catch(() => undefined);
                }}
              >
                {activeDecision === "reject" ? (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                ) : null}
                Decline
              </Button>
            </div>
            {onAlwaysAllowToolCall ? (
              <p className="text-muted-foreground text-xs">
                * Approves every use of this tool in this conversation.
              </p>
            ) : null}
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
            <InAppAgentToolCallDetails tool={tool} />
          </div>
        </details>
      )}
    </div>
  );
}
