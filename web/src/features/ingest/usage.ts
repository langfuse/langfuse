import { countTokens } from "@anthropic-ai/tokenizer";
import { type Model } from "@langfuse/shared";
import {
  type TiktokenModel,
  type Tiktoken,
  getEncoding,
  encodingForModel,
} from "js-tiktoken";
import { z } from "zod";

const chatModels = [
  "gpt-4",
  "gpt-4-0314",
  "gpt-4-0613",
  "gpt-4-32k",
  "gpt-4-32k-0314",
  "gpt-4-32k-0613",
  "gpt-3.5-turbo",
  "gpt-35-turbo",
  "gpt-3.5-turbo-0301",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-16k-0613",
  "gpt-4-1106-preview",
  "gpt-4-vision-preview",
  "gpt-4o-2024-05-13",
  "gpt-4o",
];

export type ChatModel = (typeof chatModels)[number];

export const isChatModel = (model: string): model is ChatModel => {
  return chatModels.includes(model);
};

export const isTiktokenModel = (model: string): model is TiktokenModel => {
  return [
    "davinci-002",
    "babbage-002",
    "text-davinci-003",
    "text-davinci-002",
    "text-davinci-001",
    "text-curie-001",
    "text-babbage-001",
    "text-ada-001",
    "davinci",
    "curie",
    "babbage",
    "ada",
    "code-davinci-002",
    "code-davinci-001",
    "code-cushman-002",
    "code-cushman-001",
    "davinci-codex",
    "cushman-codex",
    "text-davinci-edit-001",
    "code-davinci-edit-001",
    "text-embedding-ada-002",
    "text-similarity-davinci-001",
    "text-similarity-curie-001",
    "text-similarity-babbage-001",
    "text-similarity-ada-001",
    "text-search-davinci-doc-001",
    "text-search-curie-doc-001",
    "text-search-babbage-doc-001",
    "text-search-ada-doc-001",
    "code-search-babbage-code-001",
    "code-search-ada-code-001",
    "gpt2",
    "gpt-4",
    "gpt-4-0314",
    "gpt-4-0613",
    "gpt-4-32k",
    "gpt-4-32k-0314",
    "gpt-4-32k-0613",
    "gpt-3.5-turbo",
    "gpt-35-turbo",
    "gpt-3.5-turbo-0301",
    "gpt-3.5-turbo-0613",
    "gpt-3.5-turbo-1106",
    "gpt-3.5-turbo-16k",
    "gpt-3.5-turbo-16k-0613",
    "gpt-4-1106-preview",
    "gpt-4-vision-preview",
    "gpt-4-turbo-2024-04-09",
    "gpt-4o-2024-05-13",
    "gpt-4o",
  ].includes(model);
};

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
