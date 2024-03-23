import { isChatModel, isTiktokenModel } from "@/src/utils/types";
import { countTokens } from "@anthropic-ai/tokenizer";
import { type Model } from "@langfuse/shared";
import {
  type TiktokenModel,
  type Tiktoken,
  getEncoding,
  encodingForModel,
} from "js-tiktoken";
import { z } from "zod";

const OpenAiTokenConfig = z.object({
  tokenizerModel: z.string().refine(isTiktokenModel, {
    message: "Unknown tiktoken model",
  }),
});

const OpenAiChatTokenConfig = z.object({
  tokenizerModel: z
    .string()
    .refine((m) => isTiktokenModel(m) && isChatModel(m), {
      message: "Chat model expected",
    }),
  tokensPerMessage: z.number(),
  tokensPerName: z.number(),
});

export function tokenCount(p: {
  model: Model;
  text: unknown;
}): number | undefined {
  if (
    p.text === null ||
    p.text === undefined ||
    (Array.isArray(p.text) && p.text.length === 0)
  ) {
    return undefined;
  }

  if (p.model.tokenizerId === "openai") {
    return openAiTokenCount({
      model: p.model,
      text: p.text,
    });
  } else if (p.model.tokenizerId === "claude") {
    return claudeTokenCount(p.text);
  } else {
    console.error(`Unknown tokenizer ${p.model.tokenizerId}`);
    return undefined;
  }
}

type ChatMessage = {
  role: string;
  name?: string;
  content: string;
};

function openAiTokenCount(p: { model: Model; text: unknown }) {
  const config = OpenAiTokenConfig.safeParse(p.model.tokenizerConfig);
  if (!config.success) {
    console.error(
      `Invalid tokenizer config for model ${p.model.id}: ${JSON.stringify(
        p.model.tokenizerConfig,
      )}, ${JSON.stringify(config.error)}`,
    );
    return undefined;
  }

  let result = undefined;

  if (isChatMessageArray(p.text) && isChatModel(config.data.tokenizerModel)) {
    // check if the tokenizerConfig is a valid chat config
    const parsedConfig = OpenAiChatTokenConfig.safeParse(
      p.model.tokenizerConfig,
    );
    if (!parsedConfig.success) {
      console.error(
        `Invalid tokenizer config for chat model ${
          p.model.id
        }: ${JSON.stringify(p.model.tokenizerConfig)}`,
      );
      return undefined;
    }
    result = openAiChatTokenCount({
      messages: p.text,
      config: parsedConfig.data,
    });
  } else {
    result = isString(p.text)
      ? getTokensByModel(config.data.tokenizerModel, p.text)
      : getTokensByModel(config.data.tokenizerModel, JSON.stringify(p.text));
  }
  return result;
}

function claudeTokenCount(text: unknown) {
  return isString(text) ? countTokens(text) : countTokens(JSON.stringify(text));
}

function openAiChatTokenCount(params: {
  messages: ChatMessage[];
  config: z.infer<typeof OpenAiChatTokenConfig>;
}) {
  const model = params.config.tokenizerModel;
  if (!isTiktokenModel(model)) return undefined;

  let numTokens = 0;
  params.messages.forEach((message) => {
    numTokens += params.config.tokensPerMessage;

    Object.keys(message).forEach((key) => {
      const value = message[key as keyof typeof message];
      if (
        // check API docs for available keys: https://platform.openai.com/docs/api-reference/chat/create?lang=node.js
        // memory access out of bounds error in tiktoken if unexpected key and value of type boolean
        // expected keys with booleans work
        value &&
        [
          "content",
          "role",
          "name",
          "tool_calls",
          "function_call",
          "toolCalls",
          "functionCall",
        ].some((k) => k === key)
      ) {
        const tokens = getTokensByModel(model, value);
        if (tokens) numTokens += tokens;
      }
      if (key === "name") {
        numTokens += params.config.tokensPerName;
      }
    });
  });
  numTokens += 3; // every reply is primed with <| start |> assistant <| message |>

  return numTokens;
}

const getTokensByModel = (model: TiktokenModel, text: string) => {
  // encoiding should be kept in memory to avoid re-creating it
  let encoding: Tiktoken | undefined;
  try {
    cachedTokenizerByModel[model] =
      cachedTokenizerByModel[model] || encodingForModel(model);

    encoding = cachedTokenizerByModel[model];
  } catch (KeyError) {
    console.log("Warning: model not found. Using cl100k_base encoding.");

    encoding = getEncoding("cl100k_base");
  }
  const cleandedText = unicodeToBytesInString(text);
  return encoding?.encode(cleandedText).length;
};

interface Tokenizer {
  [model: string]: Tiktoken;
}
const cachedTokenizerByModel: Tokenizer = {};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isChatMessageArray(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(
    (item: unknown) =>
      typeof item === "object" &&
      item !== null &&
      "role" in item &&
      typeof item.role === "string" &&
      "content" in item &&
      typeof item.content === "string" &&
      (!("name" in item) || typeof item.name === "string"),
  );
}

function unicodeToBytesInString(input: string): string {
  let result = "";
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char && /[\u{10000}-\u{10FFFF}]/u.test(char)) {
      const bytes = unicodeToBytes(char);
      result += Array.from(bytes)
        .map((b) => b.toString(16))
        .join("");
    } else {
      result += char;
    }
  }
  return result;
}

function unicodeToBytes(input: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(input);
}
