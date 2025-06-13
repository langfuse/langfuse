import { Model, parseJsonPrioritised } from "@langfuse/shared";
import { isChatModel, isTiktokenModel } from "./types";
import { countTokens } from "@anthropic-ai/tokenizer";

import {
  type TiktokenModel,
  type Tiktoken,
  get_encoding,
  encoding_for_model,
} from "tiktoken";

import { z } from "zod/v4";
import {
  instrumentSync,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

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

const tokenCountMetric = "langfuse.tokenisedTokens";

export function tokenCount(p: {
  model: Model;
  text: unknown;
}): number | undefined {
  return instrumentSync(
    {
      name: "token-count",
    },
    (span) => {
      if (
        p.text === null ||
        p.text === undefined ||
        (Array.isArray(p.text) && p.text.length === 0)
      ) {
        return undefined;
      }

      if (p.model.tokenizerId === "openai") {
        const count = openAiTokenCount({
          model: p.model,
          text: p.text,
        });

        count ? span.setAttribute("token-count", count) : undefined;
        count ? span.setAttribute("tokenizer", "openai") : undefined;
        count ? recordIncrement(tokenCountMetric, count) : undefined;

        return count;
      } else if (p.model.tokenizerId === "claude") {
        const count = claudeTokenCount(p.text);

        count ? span.setAttribute("token-count", count) : undefined;
        count ? span.setAttribute("tokenizer", "claude") : undefined;
        count ? recordIncrement(tokenCountMetric, count) : undefined;

        return count;
      } else {
        if (p.model.tokenizerId) {
          logger.error(`Unknown tokenizer ${p.model.tokenizerId}`);
        }

        return undefined;
      }
    },
  );
}

type ChatMessage = {
  role: string;
  name?: string;
  content: string;
};

function openAiTokenCount(p: { model: Model; text: unknown }) {
  const config = OpenAiTokenConfig.safeParse(p.model.tokenizerConfig);
  if (!config.success) {
    logger.warn(
      `Invalid tokenizer config for model ${p.model.id}: ${JSON.stringify(
        p.model.tokenizerConfig,
      )}, ${JSON.stringify(config.error)}`,
    );
    return undefined;
  }

  let result = undefined;
  const parsedText =
    typeof p.text === "string" ? parseJsonPrioritised(p.text) : p.text; // Clickhouse stores ChatMessage array as string

  if (
    isChatMessageArray(parsedText) &&
    isChatModel(config.data.tokenizerModel)
  ) {
    // check if the tokenizerConfig is a valid chat config
    const parsedConfig = OpenAiChatTokenConfig.safeParse(
      p.model.tokenizerConfig,
    );
    if (!parsedConfig.success) {
      logger.error(
        `Invalid tokenizer config for chat model ${
          p.model.id
        }: ${JSON.stringify(p.model.tokenizerConfig)}`,
      );
      return undefined;
    }
    result = openAiChatTokenCount({
      messages: parsedText,
      config: parsedConfig.data,
    });
  } else {
    result = isString(parsedText)
      ? getTokensByModel(
          config.data.tokenizerModel as TiktokenModel,
          parsedText,
        )
      : getTokensByModel(
          config.data.tokenizerModel as TiktokenModel,
          JSON.stringify(parsedText),
        );
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
  // encoding should be kept in memory to avoid re-creating it
  let encoding: Tiktoken | undefined;
  try {
    cachedTokenizerByModel[model] =
      cachedTokenizerByModel[model] || encoding_for_model(model);

    encoding = cachedTokenizerByModel[model];
  } catch (KeyError) {
    logger.warn("Model not found. Using cl100k_base encoding.");

    encoding = get_encoding("cl100k_base");
  }
  const cleandedText = unicodeToBytesInString(text);

  logger.debug(`Tokenized data for model: ${model}`);
  return encoding?.encode(cleandedText, "all").length;
};

interface Tokenizer {
  [model: string]: Tiktoken;
}
const cachedTokenizerByModel: Tokenizer = {};

export function freeAllTokenizers() {
  Object.values(cachedTokenizerByModel).forEach((tokenizer) => {
    tokenizer.free();
  });
}

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
