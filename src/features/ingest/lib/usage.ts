import { countTokens } from "@anthropic-ai/tokenizer";
import {
  getEncoding,
  encodingForModel,
  type TiktokenModel,
  type Tiktoken,
  type TiktokenEncoding,
} from "js-tiktoken";

export function tokenCount(p: {
  internalModel: string;
  tokenizer: string;
  text: unknown;
}): number | undefined {
  if (
    p.text === null ||
    p.text === undefined ||
    (Array.isArray(p.text) && p.text.length === 0)
  ) {
    return undefined;
  }

  if (p.tokenizer === "openai") {
    return openAiTokenCount(p);
  } else if (p.tokenizer === "claude") {
    return claudeTokenCount(p);
  } else {
    console.error(`Unknown tokenizer ${p.tokenizer}`);
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
};

function openAiTokenCount(p: { internalModel: string; text: unknown }) {
  if (!isOpenAiModel(p.internalModel)) return undefined;

  return isChatMessageArray(p.text)
    ? openAiChatTokenCount({
        model: p.internalModel,
        messages: p.text,
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

function openAiChatTokenCount(params: TokenCalculationParams) {
  let tokens_per_message = 0;
  let tokens_per_name = 0;

  if (
    [
      "gpt-3.5-turbo-0613",
      "gpt-3.5-turbo-16k-0613",
      "gpt-4-0314",
      "gpt-4-32k-0314",
      "gpt-4-0613",
      "gpt-4-32k-0613",
    ].includes(params.model)
  ) {
    tokens_per_message = 3;
    tokens_per_name = 1;
  } else if (params.model === "gpt-3.5-turbo-0301") {
    tokens_per_message = 4; // every message follows <|start|>{role/name}\n{content}<|end|>\n
    tokens_per_name = -1; // if there's a name, the role is omitted
  } else if (
    params.model.includes("gpt-3.5-turbo") ||
    params.model.startsWith("gpt-3.5")
  ) {
    return openAiChatTokenCount({ ...params, model: "gpt-3.5-turbo-0613" });
  } else if (params.model.includes("gpt-4")) {
    return openAiChatTokenCount({ ...params, model: "gpt-4-0613" });
  } else {
    console.error(`Not implemented for model ${params.model}`);
    throw new Error(`Not implemented for model ${params.model}`);
  }
  let num_tokens = 0;
  params.messages.forEach((message) => {
    num_tokens += tokens_per_message;

    Object.keys(message).forEach((key) => {
      const value = message[key as keyof typeof message];
      if (value) {
        num_tokens += getTokensByModel(params.model, value);
      }
      if (key === "name") {
        num_tokens += tokens_per_name;
      }
    });
  });
  num_tokens += 3; // every reply is primed with <| start |> assistant <| message |>

  return num_tokens;
}

const openAiStringTokenCount = (p: { model: string; text: string }) => {
  if (
    p.model.toLowerCase().startsWith("gpt") ||
    p.model.toLowerCase().includes("ada")
  ) {
    return getTokens("cl100k_base", p.text);
  }
  if (p.model.toLowerCase().startsWith("text-davinci")) {
    return getTokens("p50k_base", p.text);
  }
  console.log("Unknown model", p.model);
  return undefined;
};

const getTokens = (name: TiktokenEncoding, text: string) => {
  const encoding = getEncoding(name);
  const tokens = encoding.encode(text);

  return tokens.length;
};

const getTokensByModel = (model: TiktokenModel, text: string) => {
  let encoding: Tiktoken;
  try {
    encoding = encodingForModel(model);
  } catch (KeyError) {
    console.log("Warning: model not found. Using cl100k_base encoding.");
    encoding = getEncoding("cl100k_base");
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
