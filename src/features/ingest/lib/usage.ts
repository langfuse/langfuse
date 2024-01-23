import { countTokens } from "@anthropic-ai/tokenizer";
import { type Model } from "@prisma/client";
import {
  type TiktokenModel,
  type Tiktoken,
  type TiktokenEncoding,
  get_encoding,
  encoding_for_model,
} from "tiktoken";
import { z } from "zod";

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
    // check if the tokenizerConfig is a valid OpenAiTokenConfig
    const parsedConfig = OpenAiTokenConfig.safeParse(p.model.tokenizerConfig);
    if (!parsedConfig.success) {
      console.error(
        `Invalid tokenizer config for model ${p.model.id}: ${JSON.stringify(
          p.model.tokenizerConfig,
        )}`,
      );
      return undefined;
    }

    return openAiTokenCount({
      internalModel: p.model.modelName,
      config: parsedConfig.data,
      text: p.text,
    });
  } else if (p.model.tokenizerId === "claude") {
    return claudeTokenCount({
      internalModel: p.model.modelName,
      text: p.text,
    });
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

type TokenCalculationParams = {
  messages: ChatMessage[];
  model: TiktokenModel;
  config: z.infer<typeof OpenAiTokenConfig>;
};

function openAiTokenCount(p: {
  internalModel: string;
  text: unknown;
  config: z.infer<typeof OpenAiTokenConfig>;
}) {
  if (!isOpenAiModel(p.internalModel)) return undefined;

  return isChatMessageArray(p.text)
    ? openAiChatTokenCount({
        model: p.internalModel,
        messages: p.text,
        config: p.config,
      })
    : isString(p.text)
      ? openAiStringTokenCount({ model: p.internalModel, text: p.text })
      : openAiStringTokenCount({
          model: p.internalModel,
          text: JSON.stringify(p.text),
        });
}
function claudeTokenCount(p: { internalModel: string; text: unknown }) {
  return isString(p.text)
    ? countTokens(p.text)
    : countTokens(JSON.stringify(p.text));
}

const OpenAiTokenConfig = z.object({
  tokensPerMessage: z.number(),
  tokensPerName: z.number(),
});

function openAiChatTokenCount(params: TokenCalculationParams) {
  let numTokens = 0;
  params.messages.forEach((message) => {
    numTokens += params.config.tokensPerMessage;

    Object.keys(message).forEach((key) => {
      const value = message[key as keyof typeof message];
      if (value) {
        numTokens += getTokensByModel(params.model, value);
      }
      if (key === "name") {
        numTokens += params.config.tokensPerName;
      }
    });
  });
  numTokens += 3; // every reply is primed with <| start |> assistant <| message |>

  return numTokens;
}

const openAiStringTokenCount = (p: { model: string; text: string }) => {
  if (
    p.model.toLowerCase().startsWith("gpt") ||
    p.model.toLowerCase().includes("ada")
  ) {
    return getTokensByEncoding("cl100k_base", p.text);
  }
  if (p.model.toLowerCase().startsWith("text-davinci")) {
    return getTokensByEncoding("p50k_base", p.text);
  }
  console.log("Unknown model", p.model);
  return undefined;
};

const getTokensByEncoding = (name: TiktokenEncoding, text: string) => {
  const encoding = get_encoding(name);
  const tokens = encoding.encode(text);

  return tokens.length;
};

const getTokensByModel = (model: TiktokenModel, text: string) => {
  let encoding: Tiktoken;
  try {
    encoding = encoding_for_model(model);
  } catch (KeyError) {
    console.log("Warning: model not found. Using cl100k_base encoding.");
    encoding = get_encoding("cl100k_base");
  }

  return encoding.encode(text).length;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOpenAiModel(model: string): model is TiktokenModel {
  return !!model.includes(model as TiktokenModel);
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
