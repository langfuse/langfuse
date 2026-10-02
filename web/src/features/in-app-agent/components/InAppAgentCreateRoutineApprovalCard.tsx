"use client";

import { useState } from "react";
import { Check, Loader2, Wrench } from "lucide-react";
import {
  CreateAndTestRoutineToolInputSchema,
  IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH,
  IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH,
  type CreateAndTestRoutineToolInput,
} from "@langfuse/shared/in-app-agent";
import { Input } from "@/src/components/design-system/Input/Input";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { cn } from "@/src/utils/tailwind";
import type { InAppAgentToolCallContent } from "@/src/features/in-app-agent/components/utils/utils";

export function InAppAgentCreateRoutineApprovalCard({
  tool,
  isCompact,
  isDisabled,
  onApproveToolCall,
  onRejectToolCall,
}: {
  tool: InAppAgentToolCallContent;
  isCompact: boolean;
  isDisabled: boolean;
  onApproveToolCall: (
    approvalId: string,
    editedArgs: CreateAndTestRoutineToolInput,
  ) => Promise<void>;
  onRejectToolCall: (approvalId: string) => Promise<void>;
}) {
  const [values, setValues] = useState<CreateAndTestRoutineToolInput>(() =>
    parseCreateRoutineToolArgs(tool.args),
  );
  const [activeDecision, setActiveDecision] = useState<
    "once" | "reject" | null
  >(null);
  const approval = tool.approval;
  const isApprovalPending = approval?.status === "pending";
  const isDecisionSubmitting =
    approval?.status === "submitting" || activeDecision !== null;
  const parsedValues = CreateAndTestRoutineToolInputSchema.safeParse(values);
  const canApprove =
    Boolean(approval) &&
    isApprovalPending &&
    !isDisabled &&
    !isDecisionSubmitting &&
    parsedValues.success;

  const decide = async (
    decision: NonNullable<typeof activeDecision>,
    submit: () => Promise<void>,
  ) => {
    if (!approval || !isApprovalPending || isDecisionSubmitting) {
      return;
    }

    setActiveDecision(decision);
    try {
      await submit();
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
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs leading-none font-bold">
          <Wrench className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span
            className="min-w-0 flex-1 truncate py-0.5"
            title="Approve this routine?"
          >
            Approve this routine?
          </span>
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <Input
              value={values.name}
              maxLength={IN_APP_AGENT_ROUTINE_NAME_MAX_LENGTH}
              disabled={isDisabled || isDecisionSubmitting}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Prompt
            <Textarea
              aria-label="Routine prompt"
              value={values.prompt}
              maxLength={IN_APP_AGENT_ROUTINE_PROMPT_MAX_LENGTH}
              disabled={isDisabled || isDecisionSubmitting}
              rows={isCompact ? 4 : 5}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  prompt: event.target.value,
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Cron
            <Input
              value={values.cron}
              maxLength={128}
              disabled={isDisabled || isDecisionSubmitting}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  cron: event.target.value,
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Timezone
            <Input
              value={values.timezone}
              maxLength={64}
              disabled={isDisabled || isDecisionSubmitting}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  timezone: event.target.value,
                }))
              }
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline-success"
              className="h-7"
              disabled={!canApprove}
              aria-busy={activeDecision === "once"}
              onClick={() => {
                if (!approval || !parsedValues.success) {
                  return;
                }

                decide("once", () =>
                  onApproveToolCall(approval.id, parsedValues.data),
                ).catch(() => undefined);
              }}
            >
              {activeDecision === "once" ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <Check className="mr-1 size-3" />
              )}
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={
                isDisabled ||
                isDecisionSubmitting ||
                !approval ||
                !isApprovalPending
              }
              aria-busy={activeDecision === "reject"}
              onClick={() => {
                if (!approval) {
                  return;
                }

                decide("reject", () => onRejectToolCall(approval.id)).catch(
                  () => undefined,
                );
              }}
            >
              {activeDecision === "reject" ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : null}
              Decline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseCreateRoutineToolArgs(
  args: string,
): CreateAndTestRoutineToolInput {
  try {
    const parsed: unknown = JSON.parse(args);
    if (!parsed || typeof parsed !== "object") {
      return emptyCreateRoutineToolArgs();
    }

    const record = parsed as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : "",
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      cron: typeof record.cron === "string" ? record.cron : "",
      timezone: typeof record.timezone === "string" ? record.timezone : "",
    };
  } catch {
    return emptyCreateRoutineToolArgs();
  }
}

function emptyCreateRoutineToolArgs(): CreateAndTestRoutineToolInput {
  return {
    name: "",
    prompt: "",
    cron: "",
    timezone: "",
  };
}
