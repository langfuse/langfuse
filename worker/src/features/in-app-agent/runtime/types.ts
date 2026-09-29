import { z } from "zod";
import type { AgUiContext, AgUiMessage } from "@langfuse/shared/in-app-agent";
import { InAppAgentToolApprovalRequestSchema } from "@langfuse/shared/in-app-agent";

type AgUiTool = {
  name: string;
  description: string;
  parameters?: unknown;
  metadata?: Record<string, unknown>;
};

export const ResumeForwardedPropsSchema = z.object({
  command: z.object({
    resume: z.object({
      approved: z.boolean(),
      continuationNumber: z.number().int().positive().optional(),
      rootRunId: z.string().min(1).optional(),
      traceStartedAt: z.iso.datetime({ offset: true }).optional(),
      approvalRequestedAt: z.iso.datetime({ offset: true }).optional(),
      approvalDecidedAt: z.iso.datetime({ offset: true }).optional(),
      approvalRequest: InAppAgentToolApprovalRequestSchema,
    }),
  }),
});

export type ResumeForwardedProps = z.infer<typeof ResumeForwardedPropsSchema>;

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
