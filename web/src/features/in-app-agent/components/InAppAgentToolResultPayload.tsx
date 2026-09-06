"use client";

import { InAppAgentToolPayload } from "./InAppAgentToolPayload";
import type { InAppAgentToolCallContent } from "./utils/utils";
import { useSharedUiTranslations } from "@/src/utils/shared-ui-translations";

const TOOL_CALL_RESULT_PRESENTATION = {
  running: { labelKey: "result", variant: "default" },
  succeeded: { labelKey: "result", variant: "default" },
  failed: { labelKey: "error", variant: "failed" },
  denied: { labelKey: "denied", variant: "denied" },
} as const satisfies Record<
  InAppAgentToolCallContent["status"],
  {
    labelKey: "result" | "error" | "denied";
    variant: "default" | "failed" | "denied";
  }
>;

export function InAppAgentToolResultPayload({
  tool,
}: {
  tool: InAppAgentToolCallContent;
}) {
  const t = useSharedUiTranslations("agent");
  if (tool.result === undefined && tool.error === undefined) {
    return null;
  }

  const presentation = TOOL_CALL_RESULT_PRESENTATION[tool.status];

  return (
    <InAppAgentToolPayload
      label={t(presentation.labelKey)}
      value={tool.error ?? tool.result ?? ""}
      variant={presentation.variant}
    />
  );
}
