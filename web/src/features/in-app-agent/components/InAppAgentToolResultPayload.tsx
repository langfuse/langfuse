"use client";

import { InAppAgentToolPayload } from "./InAppAgentToolPayload";
import type { InAppAgentToolCallContent } from "./utils/utils";

const TOOL_CALL_RESULT_PRESENTATION = {
  running: { label: "Result", variant: "default" },
  succeeded: { label: "Result", variant: "default" },
  failed: { label: "Error", variant: "failed" },
  denied: { label: "Denied", variant: "denied" },
} as const satisfies Record<
  InAppAgentToolCallContent["status"],
  {
    label: string;
    variant: "default" | "failed" | "denied";
  }
>;

export function InAppAgentToolResultPayload({
  status,
  value,
}: {
  status: InAppAgentToolCallContent["status"];
  value: string;
}) {
  const presentation = TOOL_CALL_RESULT_PRESENTATION[status];

  return (
    <InAppAgentToolPayload
      label={presentation.label}
      value={value}
      variant={presentation.variant}
    />
  );
}
