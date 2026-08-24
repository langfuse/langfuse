import { isRecord } from "@langfuse/shared/in-app-agent/server/toolErrors";

import { isCurrentTimePromptMessage } from "./currentTime";

const BEDROCK_CLAUDE_MODEL_ID_PART = "anthropic.claude";

const BEDROCK_PROMPT_CACHE_POINT = { type: "default" as const };

/**
 * Bedrock Converse prompt cache.
 *
 * A cachePoint writes the prefix `tools → that message`. The next call
 * cache-reads only if that prefix is byte-identical. Hits last 5 minutes
 * and refresh on read. Claude-only: Bedrock Converse ignores Anthropic
 * `cacheControl`, so we do not dual-write it.
 *
 * Three checkpoints, each for a different prefix:
 *
 * 1. Last leading system — tools + compiled system. Must stay byte-stable
 *    across turns (calendar day only; screen lives on the last user).
 * 2. Last conversation message — grows as this turn adds tool results so
 *    the next in-loop step can read it. A trailing `<current_time>` suffix
 *    is excluded: that clock changes every request and must not steal this
 *    checkpoint or the previous-turn walk.
 * 3. Previous-turn prefix — only when the last conversation message is a
 *    new user turn. The previous write sat on a tool result or prior user,
 *    not the closing assistant (that was model output). Skip trailing
 *    assistants, then stamp that predecessor.
 */
export function applyBedrockPromptCacheToCall<T>(
  modelId: string,
  options: T,
  extraLastUserText?: string,
): T {
  if (!isRecord(options) || !Array.isArray(options.prompt)) {
    return options;
  }

  // Screen (and any other turn-scoped text) is appended to the latest user
  // message so it does not sit in the cached tools+system prefix. After the
  // current-time processor adds a trailing user suffix, that suffix is the
  // latest user — so screen rides the volatile tail instead of mutating
  // earlier conversation messages.
  const prompt =
    extraLastUserText && extraLastUserText.length > 0
      ? appendTextToLastUserMessage(options.prompt, extraLastUserText)
      : options.prompt;

  if (!shouldApplyBedrockPromptCache(modelId)) {
    if (prompt === options.prompt) {
      return options;
    }

    return {
      ...options,
      prompt,
    };
  }

  return {
    ...options,
    prompt: applyBedrockPromptCachePoints(prompt),
  };
}

export function applyBedrockPromptCachePoints(prompt: unknown) {
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
    cacheIndices.has(index) ? withBedrockCachePoint(message) : message,
  );
}

function shouldApplyBedrockPromptCache(modelId: string) {
  return modelId.includes(BEDROCK_CLAUDE_MODEL_ID_PART);
}

function getLastConversationIndex(prompt: unknown[]) {
  const lastIndex = prompt.length - 1;
  if (lastIndex < 0) {
    return -1;
  }

  return isCurrentTimePromptMessage(prompt[lastIndex])
    ? lastIndex - 1
    : lastIndex;
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

function appendTextToLastUserMessage(
  prompt: unknown[],
  text: string,
): unknown[] {
  if (!text) {
    return prompt;
  }

  let lastUserIndex = -1;
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (getMessageRole(prompt[i]) === "user") {
      lastUserIndex = i;
      break;
    }
  }

  if (lastUserIndex < 0) {
    return [...prompt, { role: "user", content: [{ type: "text", text }] }];
  }

  const message = prompt[lastUserIndex];
  if (!isRecord(message)) {
    return prompt;
  }

  const nextMessage = {
    ...message,
    content: appendTextContent(message.content, text),
  };

  return prompt.map((item, index) =>
    index === lastUserIndex ? nextMessage : item,
  );
}

function appendTextContent(content: unknown, text: string) {
  if (typeof content === "string") {
    return `${content}\n\n${text}`;
  }

  if (Array.isArray(content)) {
    return [...content, { type: "text", text }];
  }

  return [{ type: "text", text }];
}

function getMessageRole(message: unknown) {
  return isRecord(message) && typeof message.role === "string"
    ? message.role
    : undefined;
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
