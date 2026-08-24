import { isRecord } from "@langfuse/shared/in-app-agent/server/toolErrors";

export type PromptCacheProvider = "bedrock" | "anthropic";

const BEDROCK_CLAUDE_MODEL_ID_PART = "anthropic.claude";
const ANTHROPIC_CLAUDE_MODEL_ID_PART = "claude";

const BEDROCK_PROMPT_CACHE_POINT = { type: "default" as const };
const ANTHROPIC_CACHE_CONTROL = { type: "ephemeral" as const };

/**
 * Prompt cache for Claude on Bedrock Converse and native Anthropic Messages.
 *
 * A checkpoint writes the prefix `tools → that message`. The next call
 * cache-reads only if that prefix is byte-identical. Hits last 5 minutes
 * and refresh on read.
 *
 * Stamp only the matching provider field. Bedrock Converse ignores Anthropic
 * `cacheControl`; Anthropic Messages ignores Bedrock `cachePoint`.
 *
 * Three checkpoints, each for a different prefix:
 *
 * 1. Last leading system — tools + compiled system. Must stay byte-stable
 *    across turns (date, screen, and clock live on a trailing suffix that
 *    is not persisted).
 * 2. Last conversation message — grows as this turn adds tool results so
 *    the next in-loop step can read it. A trailing `<current_time>` suffix
 *    is excluded: that clock changes every request and must not steal this
 *    checkpoint or the previous-turn walk.
 * 3. Previous-turn prefix — only when the last conversation message is a
 *    new user turn. The previous write sat on a tool result or prior user,
 *    not the closing assistant (that was model output). Skip trailing
 *    assistants, then stamp that predecessor.
 */
export function applyPromptCacheToCall<T>({
  provider,
  modelId,
  options,
}: {
  provider: string;
  modelId: string;
  options: T;
}): T {
  const cacheProvider = resolvePromptCacheProvider(provider, modelId);
  if (
    cacheProvider == null ||
    !isRecord(options) ||
    !Array.isArray(options.prompt)
  ) {
    return options;
  }

  return {
    ...options,
    prompt: applyPromptCachePoints(options.prompt, cacheProvider),
  };
}

export function applyPromptCachePoints(
  prompt: unknown,
  cacheProvider: PromptCacheProvider,
) {
  if (!Array.isArray(prompt) || prompt.length === 0) {
    return prompt;
  }

  let lastLeadingSystemIndex = -1;
  for (let i = 0; i < prompt.length; i++) {
    if (getMessageRole(prompt[i]) !== "system") {
      break;
    }
    lastLeadingSystemIndex = i;
  }

  const lastConversationIndex = getLastConversationIndex(prompt);
  const cacheIndices = new Set<number>();
  if (lastConversationIndex >= 0) {
    cacheIndices.add(lastConversationIndex);
  }
  if (lastLeadingSystemIndex >= 0) {
    cacheIndices.add(lastLeadingSystemIndex);
  }

  const previousTurnIndex = findPreviousTurnCacheIndex(
    prompt,
    lastLeadingSystemIndex,
    lastConversationIndex,
  );
  if (previousTurnIndex >= 0) {
    cacheIndices.add(previousTurnIndex);
  }

  return prompt.map((message, index) =>
    cacheIndices.has(index)
      ? withPromptCache(message, cacheProvider)
      : message,
  );
}

function resolvePromptCacheProvider(
  provider: string,
  modelId: string,
): PromptCacheProvider | undefined {
  if (
    provider.includes("bedrock") &&
    modelId.includes(BEDROCK_CLAUDE_MODEL_ID_PART)
  ) {
    return "bedrock";
  }
  if (
    provider.includes("anthropic") &&
    modelId.includes(ANTHROPIC_CLAUDE_MODEL_ID_PART)
  ) {
    return "anthropic";
  }
  return undefined;
}

function getLastConversationIndex(prompt: unknown[]) {
  const lastIndex = prompt.length - 1;
  if (lastIndex < 0) {
    return -1;
  }

  return isTrailingCurrentTimeMessage(prompt[lastIndex])
    ? lastIndex - 1
    : lastIndex;
}

function isTrailingCurrentTimeMessage(message: unknown) {
  if (getMessageRole(message) !== "user" || !isRecord(message)) {
    return false;
  }

  const content = message.content;
  if (typeof content === "string") {
    return content.startsWith("<current_time");
  }

  if (!Array.isArray(content)) {
    return false;
  }

  const text = content.find(
    (part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string",
  );
  return isRecord(text) && typeof text.text === "string"
    ? text.text.startsWith("<current_time")
    : false;
}

function findPreviousTurnCacheIndex(
  prompt: unknown[],
  lastLeadingSystemIndex: number,
  lastConversationIndex: number,
) {
  if (lastConversationIndex < 0) {
    return -1;
  }

  if (getMessageRole(prompt[lastConversationIndex]) !== "user") {
    return -1;
  }

  for (let i = lastConversationIndex - 1; i > lastLeadingSystemIndex; i--) {
    if (getMessageRole(prompt[i]) !== "assistant") {
      return i;
    }
  }

  return -1;
}

function getMessageRole(message: unknown) {
  return isRecord(message) && typeof message.role === "string"
    ? message.role
    : undefined;
}

function withPromptCache(
  message: unknown,
  cacheProvider: PromptCacheProvider,
) {
  return cacheProvider === "bedrock"
    ? withBedrockCachePoint(message)
    : withAnthropicCacheControl(message);
}

function withBedrockCachePoint(message: unknown) {
  if (!isRecord(message)) {
    return message;
  }

  const providerOptions = isRecord(message.providerOptions)
    ? message.providerOptions
    : {};
  const bedrock = isRecord(providerOptions.bedrock)
    ? providerOptions.bedrock
    : {};

  if (isRecord(bedrock.cachePoint)) {
    return message;
  }

  return {
    ...message,
    providerOptions: {
      ...providerOptions,
      bedrock: {
        ...bedrock,
        cachePoint: BEDROCK_PROMPT_CACHE_POINT,
      },
    },
  };
}

function withAnthropicCacheControl(message: unknown) {
  if (!isRecord(message)) {
    return message;
  }

  const providerOptions = isRecord(message.providerOptions)
    ? message.providerOptions
    : {};
  const anthropic = isRecord(providerOptions.anthropic)
    ? providerOptions.anthropic
    : {};

  if (isRecord(anthropic.cacheControl)) {
    return message;
  }

  return {
    ...message,
    providerOptions: {
      ...providerOptions,
      anthropic: {
        ...anthropic,
        cacheControl: ANTHROPIC_CACHE_CONTROL,
      },
    },
  };
}
