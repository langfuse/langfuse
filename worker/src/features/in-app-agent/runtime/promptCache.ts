import { isRecord } from "@langfuse/shared/in-app-agent/server/toolErrors";

type PromptCacheProvider =
  | "bedrock"
  | "anthropic"
  | "openai-compatible"
  | "openai-responses";

const BEDROCK_CLAUDE_MODEL_ID_PART = "anthropic.claude";
const ANTHROPIC_CLAUDE_MODEL_ID_PART = "claude";

const BEDROCK_PROMPT_CACHE_POINT = { type: "default" as const };
const ANTHROPIC_CACHE_CONTROL = { type: "ephemeral" as const };
const OPENAI_PROMPT_CACHE_BREAKPOINT = { mode: "explicit" as const };

/**
 * Prompt cache for Claude on Bedrock Converse, native Anthropic Messages,
 * and Claude behind an OpenAI-compatible gateway (Ramp Router, OpenRouter,
 * LiteLLM). Native Messages get `anthropic.cacheControl`. Compatible
 * Chat Completions get `openaiCompatible.cache_control` because that SDK
 * only forwards the `openaiCompatible` namespace. Responses get
 * `openai.promptCacheBreakpoint`, which the SDK emits as the
 * `prompt_cache_breakpoint` marker; a translating gateway maps it to
 * Anthropic `cache_control`.
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
 *    across turns (user, screen, and clock live on a trailing suffix that
 *    is not persisted).
 * 2. Last conversation message — grows as this turn adds tool results so
 *    the next in-loop step can read it. A trailing `<current_time>` suffix
 *    is excluded: that clock changes every request and must not steal this
 *    checkpoint or the previous-turn walk.
 * 3. Previous-turn prefix — only when the last conversation message is a
 *    new user turn. The previous write sat on a tool result or prior user,
 *    not the closing assistant (that was model output). Skip trailing
 *    assistants, then stamp that predecessor.
 *
 * The Responses converter emits the marker only for system messages, user
 * parts, and content-typed tool outputs. Assistant messages never carry it
 * and this agent returns JSON tool results, so a checkpoint chosen for an
 * assistant or tool message moves back to the nearest preceding user or
 * system message. In-loop steps read through the latest user turn and send
 * this turn's tool calls and results uncached.
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
  const addCheckpoint = (index: number) => {
    const carrierIndex = findCarrierIndex(prompt, index, cacheProvider);
    if (carrierIndex >= 0) {
      cacheIndices.add(carrierIndex);
    }
  };

  if (lastConversationIndex >= 0) {
    addCheckpoint(lastConversationIndex);
  }
  if (lastLeadingSystemIndex >= 0) {
    addCheckpoint(lastLeadingSystemIndex);
  }

  const previousTurnIndex = findPreviousTurnCacheIndex(
    prompt,
    lastLeadingSystemIndex,
    lastConversationIndex,
  );
  if (previousTurnIndex >= 0) {
    addCheckpoint(previousTurnIndex);
  }

  return prompt.map((message, index) =>
    cacheIndices.has(index) ? withPromptCache(message, cacheProvider) : message,
  );
}

function findCarrierIndex(
  prompt: unknown[],
  index: number,
  cacheProvider: PromptCacheProvider,
) {
  for (let i = index; i >= 0; i--) {
    if (canCarryPromptCache(prompt[i], cacheProvider)) {
      return i;
    }
  }
  return -1;
}

function canCarryPromptCache(
  message: unknown,
  cacheProvider: PromptCacheProvider,
) {
  if (cacheProvider !== "openai-responses") {
    return true;
  }

  const role = getMessageRole(message);
  return (
    role === "system" ||
    (role === "user" &&
      isRecord(message) &&
      Array.isArray(message.content) &&
      message.content.length > 0)
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
  if (
    provider.includes("openai.responses") &&
    modelId.includes(ANTHROPIC_CLAUDE_MODEL_ID_PART)
  ) {
    return "openai-responses";
  }
  // OpenRouter / LiteLLM Chat Completions: provider is `openai.chat` but
  // the upstream model id is still `anthropic/claude-…`.
  if (modelId.includes("anthropic")) {
    return "openai-compatible";
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

function withPromptCache(message: unknown, cacheProvider: PromptCacheProvider) {
  if (cacheProvider === "bedrock") {
    return withBedrockCachePoint(message);
  }
  if (cacheProvider === "openai-compatible") {
    return withOpenAICompatibleCacheControl(message);
  }
  if (cacheProvider === "openai-responses") {
    return withOpenAIResponsesCacheBreakpoint(message);
  }
  return withAnthropicCacheControl(message);
}

// The Responses converter reads `openai.promptCacheBreakpoint` from the
// message for system messages and from each part for user messages.
function withOpenAIResponsesCacheBreakpoint(message: unknown) {
  if (!isRecord(message)) {
    return message;
  }

  if (getMessageRole(message) === "system") {
    return {
      ...message,
      providerOptions: stampOpenAIPromptCacheBreakpoint(
        message.providerOptions,
      ),
    };
  }

  return withLastPartProviderOptions(message, stampOpenAIPromptCacheBreakpoint);
}

function stampOpenAIPromptCacheBreakpoint(providerOptions: unknown) {
  const options = isRecord(providerOptions) ? providerOptions : {};
  const openai = isRecord(options.openai) ? options.openai : {};

  if (isRecord(openai.promptCacheBreakpoint)) {
    return options;
  }

  return {
    ...options,
    openai: {
      ...openai,
      promptCacheBreakpoint: OPENAI_PROMPT_CACHE_BREAKPOINT,
    },
  };
}

function withLastPartProviderOptions(
  message: Record<string, unknown>,
  stamp: (providerOptions: unknown) => unknown,
) {
  if (!Array.isArray(message.content) || message.content.length === 0) {
    return message;
  }

  const lastIndex = message.content.length - 1;
  const lastPart = message.content[lastIndex];
  if (!isRecord(lastPart)) {
    return message;
  }

  const nextContent = message.content.slice();
  nextContent[lastIndex] = {
    ...lastPart,
    providerOptions: stamp(lastPart.providerOptions),
  };

  return {
    ...message,
    content: nextContent,
  };
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

function withOpenAICompatibleCacheControl(message: unknown) {
  if (!isRecord(message)) {
    return message;
  }

  const providerOptions = isRecord(message.providerOptions)
    ? message.providerOptions
    : {};
  const openaiCompatible = isRecord(providerOptions.openaiCompatible)
    ? providerOptions.openaiCompatible
    : {};

  if (isRecord(openaiCompatible.cache_control)) {
    return message;
  }

  return withLastPartProviderOptions(
    {
      ...message,
      providerOptions: stampOpenAICompatibleCacheControl(providerOptions),
    },
    stampOpenAICompatibleCacheControl,
  );
}

function stampOpenAICompatibleCacheControl(providerOptions: unknown) {
  const options = isRecord(providerOptions) ? providerOptions : {};
  const openaiCompatible = isRecord(options.openaiCompatible)
    ? options.openaiCompatible
    : {};

  if (isRecord(openaiCompatible.cache_control)) {
    return options;
  }

  return {
    ...options,
    openaiCompatible: {
      ...openaiCompatible,
      cache_control: ANTHROPIC_CACHE_CONTROL,
    },
  };
}
