import { z } from "zod";
import { RunAgentInputSchema } from "@ag-ui/core/schemas";
import { EventType } from "@ag-ui/core";
import type { AgUiEvent } from "@langfuse/shared/in-app-agent";
import { getToolFailureMessage } from "@langfuse/shared/in-app-agent/server/toolErrors";
import { toAgUiToolResultContent } from "@langfuse/shared/in-app-agent/server/toolResults";
import type { AgUiRunAgentInput } from "./types";

const AgentEventSchema = z.looseObject({
  type: z.enum(EventType),
  timestamp: z.number().optional(),
  rawEvent: z.unknown().optional(),
});

const MastraInterruptOutcomeSchema = z.object({
  type: z.literal("interrupt"),
  interrupts: z
    .array(
      z.object({
        toolCallId: z.string().min(1),
        metadata: z.object({
          mastra: z.object({
            type: z.enum(["mastra_suspend", "mastra_tool_approval"]),
            toolName: z.string().min(1),
            args: z.unknown().optional(),
            runId: z.string().min(1),
          }),
        }),
      }),
    )
    .min(1),
});

export function toMastraRunInput(input: AgUiRunAgentInput) {
  return RunAgentInputSchema.parse(input);
}

export function normalizeMastraEvent(
  adapterEvent: unknown,
  input: Pick<AgUiRunAgentInput, "parentRunId">,
): AgUiEvent[] {
  const event = AgentEventSchema.parse(adapterEvent);
  if (event.type === EventType.RUN_FINISHED) {
    const outcome = event.outcome;
    if (
      outcome &&
      typeof outcome === "object" &&
      "type" in outcome &&
      outcome.type === "interrupt"
    ) {
      const { interrupts } = MastraInterruptOutcomeSchema.parse(outcome);
      // Halo resumes approved tools from its durable transcript, independently
      // of the adapter's in-memory interrupt state.
      return [
        ...interrupts.map(
          ({ toolCallId, metadata }): AgUiEvent => ({
            type: EventType.CUSTOM,
            name: "on_interrupt",
            value: {
              ...metadata.mastra,
              type: "mastra_suspend",
              toolCallId,
            },
          }),
        ),
        {
          type: EventType.RUN_FINISHED,
          threadId: event.threadId,
          runId: event.runId,
        },
      ];
    }
  }
  if (event.type === EventType.RUN_STARTED) {
    const publicEvent = { ...event };
    delete publicEvent.input;

    return [
      {
        ...publicEvent,
        ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      },
    ];
  }

  if (event.type === EventType.TOOL_CALL_RESULT) {
    event.content = toAgUiToolResultContent(event.content);
    if (typeof event.error === "string" && event.error.trim()) {
      return [event];
    }

    const failureMessage = getToolFailureMessage(undefined, event.content);
    if (failureMessage) {
      return [{ ...event, error: failureMessage }];
    }
  }

  return [event];
}
