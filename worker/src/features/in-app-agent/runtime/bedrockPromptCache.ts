import { isRecord } from "@langfuse/shared/in-app-agent/server/toolErrors";

const BEDROCK_CLAUDE_MODEL_ID_PART = "anthropic.claude";

const BEDROCK_PROMPT_CACHE_POINT = { type: "default" as const };

function shouldApplyBedrockPromptCache(modelId: string) {
  return modelId.includes(BEDROCK_CLAUDE_MODEL_ID_PART);
}

export function applyBedrockPromptCacheToCall<T>(
  modelId: string,
  options: T,
  extraLastUserText?: string,
): T {
  if (!isRecord(options) || !Array.isArray(options.prompt)) {
    return options;
  }

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

/**
 * Places Bedrock cache checkpoints on:
 * - the last leading system message (tools + static system)
 * - the previous turn's last cached prefix, when this call starts a new user turn
 * - the last message (growing agent-loop prefix)
 *
 * Checkpoints cover tools → system → messages. A new user message is never
 * part of the previous write, so the previous-turn checkpoint is the last
 * non-assistant message before that user turn (tool result or prior user).
 */
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

  const lastIndex = prompt.length - 1;
  const cacheIndices = new Set<number>([lastIndex]);
  if (lastLeadingSystemIndex >= 0) {
    cacheIndices.add(lastLeadingSystemIndex);
  }

  const previousTurnIndex = findPreviousTurnCacheIndex(
    prompt,
    lastLeadingSystemIndex,
  );
  if (previousTurnIndex >= 0) {
    cacheIndices.add(previousTurnIndex);
  }

  return prompt.map((message, index) =>
    cacheIndices.has(index) ? withBedrockCachePoint(message) : message,
  );
}

function findPreviousTurnCacheIndex(
  prompt: unknown[],
  lastLeadingSystemIndex: number,
) {
  const lastIndex = prompt.length - 1;
  if (getMessageRole(prompt[lastIndex]) !== "user") {
    return -1;
  }

  for (let i = lastIndex - 1; i > lastLeadingSystemIndex; i--) {
    if (getMessageRole(prompt[i]) !== "assistant") {
      return i;
    }
  }

  return -1;
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
