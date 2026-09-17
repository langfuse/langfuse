import { z } from "zod";
import type { AgUiContext, AgUiMessage } from "@langfuse/shared/in-app-agent";
import {
  InAppAgentToolApprovalRequestSchema,
  InAppAgentUserInputPayloadSchema,
  InAppAgentUserInputRequestSchema,
} from "@langfuse/shared/in-app-agent";

type AgUiTool = {
  name: string;
  description: string;
  parameters?: unknown;
  metadata?: Record<string, unknown>;
};

const ResumeLineageSchema = z.object({
  continuationNumber: z.number().int().positive().optional(),
  rootRunId: z.string().min(1).optional(),
  traceStartedAt: z.iso.datetime({ offset: true }).optional(),
  approvalRequestedAt: z.iso.datetime({ offset: true }).optional(),
  approvalDecidedAt: z.iso.datetime({ offset: true }).optional(),
});

export const ResumeForwardedPropsSchema = z.object({
  command: z.object({
    resume: z.union([
      ResumeLineageSchema.extend({
        approved: z.boolean(),
        approvalRequest: InAppAgentToolApprovalRequestSchema,
      }),
      ResumeLineageSchema.extend({
        kind: z.literal("user_input"),
        status: z.enum(["resolved", "cancelled"]),
        payload: InAppAgentUserInputPayloadSchema.optional(),
        userInputRequest: InAppAgentUserInputRequestSchema,
      }),
    ]),
  }),
});

export type ResumeForwardedProps = z.infer<typeof ResumeForwardedPropsSchema>;

export type ToolApprovalResume = Extract<
  ResumeForwardedProps["command"]["resume"],
  { approvalRequest: unknown }
>;

export type UserInputResume = Extract<
  ResumeForwardedProps["command"]["resume"],
  { kind: "user_input" }
>;

export function isToolApprovalResume(
  resume: ResumeForwardedProps["command"]["resume"] | undefined,
): resume is ToolApprovalResume {
  return resume !== undefined && "approvalRequest" in resume;
}

export function isUserInputResume(
  resume: ResumeForwardedProps["command"]["resume"] | undefined,
): resume is UserInputResume {
  return (
    resume !== undefined && "kind" in resume && resume.kind === "user_input"
  );
}

export type AgUiRunAgentInput = {
  threadId: string;
  runId: string;
  parentRunId?: string;
  state?: unknown;
  messages: AgUiMessage[];
  tools: AgUiTool[];
  context: AgUiContext;
  forwardedProps?: unknown;
};
