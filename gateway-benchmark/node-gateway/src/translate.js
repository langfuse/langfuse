import { Transform } from "node:stream";

export class TranslationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TranslationError";
  }
}

function parseDataUrl(url) {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/.exec(url);
  if (!match) {
    throw new TranslationError(
      "translate mode only supports base64 data URLs in image_url blocks",
    );
  }

  return {
    type: "image",
    source: {
      type: "base64",
      media_type: match[1],
      data: match[2].replaceAll(/\s/g, ""),
    },
  };
}

function textFromPart(part, allowImages) {
  if (part?.type === "text" && typeof part.text === "string") {
    return { type: "text", text: part.text };
  }
  if (
    allowImages &&
    part?.type === "image_url" &&
    typeof part.image_url?.url === "string"
  ) {
    return parseDataUrl(part.image_url.url);
  }
  throw new TranslationError(`unsupported content block: ${part?.type}`);
}

function contentBlocks(content, allowImages = true) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) {
    return content.map((part) => textFromPart(part, allowImages));
  }
  throw new TranslationError("message content must be a string or an array");
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TranslationError(`${name} must be a non-empty string`);
  }
  return value;
}

function functionToolCallBlock(toolCall) {
  if (toolCall?.type !== "function") {
    throw new TranslationError(
      `unsupported assistant tool call type: ${toolCall?.type}`,
    );
  }

  const id = requiredString(toolCall.id, "tool call id");
  const name = requiredString(
    toolCall.function?.name,
    "tool call function name",
  );
  const argumentsJson = requiredString(
    toolCall.function?.arguments,
    "tool call function arguments",
  );
  let input;
  try {
    input = JSON.parse(argumentsJson);
  } catch {
    throw new TranslationError(
      "tool call function arguments must be valid JSON",
    );
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TranslationError(
      "tool call function arguments must decode to an object",
    );
  }

  return { type: "tool_use", id, name, input };
}

function toolResultBlock(message) {
  const toolUseId = requiredString(message?.tool_call_id, "tool_call_id");
  const content =
    typeof message?.content === "string"
      ? message.content
      : contentBlocks(message?.content, false);
  return { type: "tool_result", tool_use_id: toolUseId, content };
}

function translateFunctionTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    throw new TranslationError("tools must be a non-empty array");
  }

  return tools.map((tool) => {
    if (tool?.type !== "function") {
      throw new TranslationError(`unsupported tool type: ${tool?.type}`);
    }
    const name = requiredString(tool.function?.name, "tool function name");
    const parameters = tool.function?.parameters ?? {
      type: "object",
      properties: {},
    };
    if (
      !parameters ||
      typeof parameters !== "object" ||
      Array.isArray(parameters)
    ) {
      throw new TranslationError("tool function parameters must be an object");
    }

    const translated = { name, input_schema: parameters };
    if (tool.function?.description !== undefined) {
      translated.description = requiredString(
        tool.function.description,
        "tool function description",
      );
    }
    return translated;
  });
}

function translateToolChoice(toolChoice) {
  switch (toolChoice) {
    case "auto":
      return { type: "auto" };
    case "required":
      return { type: "any" };
    case "none":
      return { type: "none" };
    default:
      if (toolChoice?.type === "function") {
        return {
          type: "tool",
          name: requiredString(
            toolChoice.function?.name,
            "tool choice function name",
          ),
        };
      }
      throw new TranslationError("unsupported tool_choice");
  }
}

function translateStop(stop) {
  if (typeof stop === "string") return [stop];
  if (
    Array.isArray(stop) &&
    stop.length > 0 &&
    stop.every((value) => typeof value === "string")
  ) {
    return stop;
  }
  throw new TranslationError(
    "stop must be a string or a non-empty string array",
  );
}

function copyOptionalNumber(input, output, name) {
  if (input[name] === undefined) return;
  if (typeof input[name] !== "number" || !Number.isFinite(input[name])) {
    throw new TranslationError(`${name} must be a finite number`);
  }
  output[name] = input[name];
}

function mergeAdjacentMessages(messages) {
  const merged = [];
  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous?.role === message.role)
      previous.content.push(...message.content);
    else merged.push(message);
  }
  return merged;
}

export function openAiToAnthropic(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TranslationError("request body must be a JSON object");
  }
  if (typeof input.model !== "string" || input.model.length === 0) {
    throw new TranslationError("model must be a non-empty string");
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new TranslationError("messages must be a non-empty array");
  }

  const system = [];
  const messages = [];

  for (const message of input.messages) {
    if (message?.role === "system" || message?.role === "developer") {
      system.push(...contentBlocks(message.content, false));
      continue;
    }
    if (message?.role === "user") {
      messages.push({ role: "user", content: contentBlocks(message.content) });
      continue;
    }
    if (message?.role === "assistant") {
      const content =
        message.content === null || message.content === undefined
          ? []
          : contentBlocks(message.content, false);
      if (message.tool_calls !== undefined) {
        if (
          !Array.isArray(message.tool_calls) ||
          message.tool_calls.length === 0
        ) {
          throw new TranslationError(
            "assistant tool_calls must be a non-empty array",
          );
        }
        content.push(...message.tool_calls.map(functionToolCallBlock));
      }
      if (content.length === 0) {
        throw new TranslationError(
          "assistant messages require content or function tool calls",
        );
      }
      messages.push({ role: "assistant", content });
      continue;
    }
    if (message?.role === "tool") {
      messages.push({ role: "user", content: [toolResultBlock(message)] });
      continue;
    }
    throw new TranslationError(`unsupported message role: ${message?.role}`);
  }

  if (messages.length === 0) {
    throw new TranslationError(
      "at least one user or assistant message is required",
    );
  }

  const output = {
    model: input.model,
    max_tokens:
      Number.isSafeInteger(input.max_tokens) && input.max_tokens > 0
        ? input.max_tokens
        : 1024,
    stream: input.stream === true,
    messages: mergeAdjacentMessages(messages),
  };
  if (system.length > 0) output.system = system;
  copyOptionalNumber(input, output, "temperature");
  copyOptionalNumber(input, output, "top_p");
  if (input.stop !== undefined && input.stop !== null) {
    output.stop_sequences = translateStop(input.stop);
  }
  if (input.tools !== undefined) {
    output.tools = translateFunctionTools(input.tools);
  }
  if (input.tool_choice !== undefined) {
    output.tool_choice = translateToolChoice(input.tool_choice);
  }

  return output;
}

function finishReason(reason) {
  switch (reason) {
    case "max_tokens":
    case "model_context_window_exceeded":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "end_turn":
    case "stop_sequence":
    default:
      return "stop";
  }
}

function chunk(state, delta, finalReason = null, usage) {
  const value = {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{ index: 0, delta, finish_reason: finalReason }],
  };
  if (usage) value.usage = usage;
  return `data: ${JSON.stringify(value)}\n\n`;
}

function usageChunk(state, usage) {
  return `data: ${JSON.stringify({
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [],
    usage,
  })}\n\n`;
}

function openAiUsage(state) {
  const promptTokens = state.promptTokens || 0;
  const completionTokens = state.completionTokens || 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function registerToolCall(state, contentBlockIndex) {
  if (!Number.isSafeInteger(contentBlockIndex) || contentBlockIndex < 0) {
    throw new TranslationError(
      "tool_use content block index must be an integer",
    );
  }
  if (!(state.toolCallIndices instanceof Map))
    state.toolCallIndices = new Map();
  if (!Number.isSafeInteger(state.nextToolCallIndex))
    state.nextToolCallIndex = 0;

  let toolCallIndex = state.toolCallIndices.get(contentBlockIndex);
  if (toolCallIndex === undefined) {
    toolCallIndex = state.nextToolCallIndex;
    state.nextToolCallIndex += 1;
    state.toolCallIndices.set(contentBlockIndex, toolCallIndex);
  }
  return toolCallIndex;
}

function existingToolCall(state, contentBlockIndex) {
  const toolCallIndex = state.toolCallIndices?.get(contentBlockIndex);
  if (toolCallIndex === undefined) {
    throw new TranslationError(
      "input_json_delta arrived before tool_use start",
    );
  }
  return toolCallIndex;
}

export function anthropicEventToOpenAi(event, state) {
  const data = event.data;
  switch (data?.type || event.event) {
    case "message_start": {
      const message = data.message || {};
      state.id = message.id || state.id;
      state.model = message.model || state.model;
      state.promptTokens = message.usage?.input_tokens || 0;
      state.completionTokens = message.usage?.output_tokens || 0;
      return [chunk(state, { role: "assistant", content: "" })];
    }
    case "content_block_start": {
      const block = data.content_block;
      if (block?.type === "tool_use") {
        const toolCallIndex = registerToolCall(state, data.index);
        return [
          chunk(state, {
            tool_calls: [
              {
                index: toolCallIndex,
                id: requiredString(block.id, "tool_use id"),
                type: "function",
                function: {
                  name: requiredString(block.name, "tool_use name"),
                  arguments: "",
                },
              },
            ],
          }),
        ];
      }
      const text = block?.type === "text" ? block.text : undefined;
      return typeof text === "string" && text.length > 0
        ? [chunk(state, { content: text })]
        : [];
    }
    case "content_block_delta": {
      const delta = data.delta;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return [chunk(state, { content: delta.text })];
      }
      if (
        delta?.type === "input_json_delta" &&
        typeof delta.partial_json === "string"
      ) {
        const toolCallIndex = existingToolCall(state, data.index);
        return [
          chunk(state, {
            tool_calls: [
              {
                index: toolCallIndex,
                function: { arguments: delta.partial_json },
              },
            ],
          }),
        ];
      }
      return [];
    }
    case "message_delta": {
      if (Number.isSafeInteger(data.usage?.output_tokens)) {
        state.completionTokens = data.usage.output_tokens;
      }
      if (typeof data.delta?.stop_reason !== "string" || state.finished)
        return [];
      state.finished = true;
      return [
        chunk(state, {}, finishReason(data.delta.stop_reason)),
        usageChunk(state, openAiUsage(state)),
      ];
    }
    case "message_stop": {
      if (state.sentDone) return [];
      const output = [];
      if (!state.finished) {
        state.finished = true;
        output.push(chunk(state, {}, "stop"));
        output.push(usageChunk(state, openAiUsage(state)));
      }
      state.sentDone = true;
      output.push("data: [DONE]\n\n");
      return output;
    }
    case "error":
      throw new Error(
        data.error?.message || "Anthropic stream returned an error",
      );
    case "ping":
    default:
      return [];
  }
}

function parseSseBlock(block) {
  let event = "message";
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trimStart();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { event, data: JSON.parse(data.join("\n")) };
}

export function createAnthropicSseTransform(model) {
  let pending = "";
  const decoder = new TextDecoder();
  const state = {
    id: `chatcmpl-benchmark-${Date.now()}`,
    model,
    created: Math.floor(Date.now() / 1000),
    promptTokens: 0,
    completionTokens: 0,
    finished: false,
    sentDone: false,
    toolCallIndices: new Map(),
    nextToolCallIndex: 0,
  };

  function drain(instance, flush = false) {
    pending = pending.replaceAll("\r\n", "\n");
    let boundary;
    while ((boundary = pending.indexOf("\n\n")) !== -1) {
      const block = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      if (block.length === 0) continue;
      const event = parseSseBlock(block);
      if (!event) continue;
      for (const output of anthropicEventToOpenAi(event, state)) {
        instance.push(Buffer.from(output));
      }
    }
    if (flush && pending.trim().length > 0) {
      const event = parseSseBlock(pending);
      if (event) {
        for (const output of anthropicEventToOpenAi(event, state)) {
          instance.push(Buffer.from(output));
        }
      }
      pending = "";
    }
  }

  return new Transform({
    transform(value, _encoding, callback) {
      try {
        pending += decoder.decode(value, { stream: true });
        drain(this);
        callback();
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      try {
        pending += decoder.decode();
        drain(this, true);
        callback();
      } catch (error) {
        callback(error);
      }
    },
  });
}

export function anthropicResponseToOpenAi(input) {
  const content = Array.isArray(input.content)
    ? input.content
        .filter(
          (block) => block?.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text)
        .join("")
    : "";
  const promptTokens = input.usage?.input_tokens || 0;
  const completionTokens = input.usage?.output_tokens || 0;

  return {
    id: input.id || `chatcmpl-benchmark-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason(input.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}
