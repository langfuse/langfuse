import { z } from "zod";

import {
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
} from "@langfuse/shared/in-app-agent";

export const InAppAgentWatchFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    runId: z.string(),
    status: InAppAgentRunStatusSchema,
    errorCode: z.string().nullable().optional(),
    /** Cancellation is cooperative, so this may be true while status is RUNNING. */
    cancelRequested: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("event"),
    sequenceNumber: z.number().int(),
    event: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
  z.object({ type: z.literal("done") }),
]);

export type InAppAgentWatchFrame = z.infer<typeof InAppAgentWatchFrameSchema>;

/** A parked approval occupies neither a worker nor the conversation slot. */
const IN_APP_AGENT_ACTIVE_RUN_STATUSES: readonly InAppAgentRunStatus[] = [
  InAppAgentRunStatus.QUEUED,
  InAppAgentRunStatus.RUNNING,
];

export function isActiveInAppAgentRunStatus(
  status: InAppAgentRunStatus,
): boolean {
  return IN_APP_AGENT_ACTIVE_RUN_STATUSES.includes(status);
}
