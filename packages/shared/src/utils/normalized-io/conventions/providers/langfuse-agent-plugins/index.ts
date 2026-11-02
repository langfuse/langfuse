import { claimed, unmatched } from "../..";
import { optionalString } from "../../../core/utils/json";
import { reasoningPart } from "../../../core/normalize/message-parts/reasoning";
import type { IOConvention, PartHandler } from "../../io-convention";

const normalizeChatMlThinking: PartHandler = (value) => {
  if (value.thinking !== undefined && value.thinking !== null) return unmatched;
  return claimed(
    reasoningPart(
      value.content ?? value.summary,
      optionalString(value.signature),
    ),
  );
};

export const langfuseAgentPluginsProvider = {
  name: "langfuse-agent-plugins",
  typedParts: { thinking: normalizeChatMlThinking },
  collectSiblingParts: (
    value: Record<string, unknown>,
    _baseParts,
    context,
  ) => {
    const parts = context.normalizePartList(
      Array.isArray(value.thinking) ? value.thinking : [],
    );
    return parts.length > 0
      ? [{ sourceKey: "thinking", slot: "after-content", parts }]
      : [];
  },
} satisfies IOConvention;
