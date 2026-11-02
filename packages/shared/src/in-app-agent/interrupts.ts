import { EventType } from "@ag-ui/core";
import { z } from "zod";

import { safeJsonParse } from "../utils/json";
import type { InAppAgentToolApprovalRequest } from "./schema";

const MastraSuspendEventSchema = z.object({
  type: z.literal("mastra_suspend"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().optional(),
  runId: z.string().min(1),
});

/** Parses the durable interrupt event shape in browser and server runtimes. */
export function parseInAppAgentInterruptEvent(
  event: unknown,
): InAppAgentToolApprovalRequest | undefined {
  if (
    !event ||
    typeof event !== "object" ||
    !("type" in event) ||
    event.type !== EventType.CUSTOM ||
    !("name" in event) ||
    event.name !== "on_interrupt"
  ) {
    return undefined;
  }

  const value = "value" in event ? event.value : undefined;
  const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
  const interrupt = MastraSuspendEventSchema.safeParse(parsedValue);

  return interrupt.success
    ? { ...interrupt.data, type: "tool_approval_request" }
    : undefined;
}
