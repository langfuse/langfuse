"use client";

import { useState } from "react";
import { Check, Loader2, RotateCcw, Wrench, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { InAppAgentToolPayload } from "./InAppAgentToolPayload";
import { InAppAgentToolResultPayload } from "./InAppAgentToolResultPayload";
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
  onRetryToolApprovals,
}: {
  tool: InAppAgentToolCallContent;
  isCompact?: boolean;
  isDisabled?: boolean;
  onApproveToolCall?: (approvalId: string) => Promise<void>;
  /** Omit this callback when conversation grants do not apply. */
  onAlwaysAllowToolCall?: (approvalId: string) => Promise<void>;
  onRejectToolCall?: (approvalId: string) => Promise<void>;
  onRetryToolApprovals?: (approvalId: string) => Promise<void>;
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
  const isRejected = approval?.decision?.approved === false;
  const progressLabel =
    approval?.position && approval.total && approval.total > 1
      ? `${approval.position} of ${approval.total}`
      : null;
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
              {isRejected
                ? `Rejected ${displayName}`
                : approval.decision?.approved
                  ? `Approved ${displayName}`
                  : approveLabel}
            </span>
            {progressLabel ? (
              <span className="text-muted-foreground">{progressLabel}</span>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            <InAppAgentToolPayload
              label="Arguments"
              value={tool.args}
              variant="default"
            />
            {isRejected ? (
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <X className="text-destructive size-3.5" />
                Rejected
              </div>
            ) : approval.decision?.approved ? (
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                {isApprovalSubmitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                {isApprovalSubmitting ? "Submitting" : "Waiting to submit"}
              </div>
            ) : approval.status === "queued" ? (
              <p className="text-muted-foreground text-xs">
                Review the earlier approval first.
              </p>
            ) : null}
            {approval.status === "retry" && onRetryToolApprovals ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-destructive text-xs">
                  Unable to submit these decisions.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => {
                    onRetryToolApprovals(approval.id).catch(() => undefined);
                  }}
                >
                  <RotateCcw className="mr-1 size-3" />
                  Retry
                </Button>
              </div>
            ) : null}
            {isApprovalPending ? (
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
                  Confirm
                </Button>
                {onAlwaysAllowToolCall ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    title={`Always allow ${tool.name} for this conversation`}
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
                    Always allow
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
                  Reject
                </Button>
              </div>
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
