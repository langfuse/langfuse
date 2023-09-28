import {
  type TiktokenEncoding,
  get_encoding,
  encoding_for_model,
  type TiktokenModel,
  type Tiktoken,
} from "tiktoken";
import { countTokens } from "@anthropic-ai/tokenizer";
import { type Pricing } from "@prisma/client";
import { Decimal } from "decimal.js";

type ChatMessage = {
  role: string;
  name?: string;
  content: string;
};

type TokenCalculationParams = {
  messages: ChatMessage[];
  model: TiktokenModel;
};

export function tokenCount(p: {
  model: string;
  text: unknown;
}): number | undefined {
  if (
    p.text === null ||
    p.text === undefined ||
    (Array.isArray(p.text) && p.text.length === 0)
  ) {
    return undefined;
  } else if (isOpenAiModel(p.model)) {
    return isChatMessageArray(p.text)
      ? openAiChatTokenCount({
          model: p.model,
          messages: p.text,
        })
      : isString(p.text)
      ? openAiStringTokenCount({ model: p.model, text: p.text })
      : openAiStringTokenCount({
          model: p.model,
          text: JSON.stringify(p.text),
        });
  } else if (isClaudeModel(p.model)) {
    return isString(p.text)
      ? claudeStringTokenCount({ model: p.model, text: p.text })
      : claudeStringTokenCount({
          model: p.model,
          text: JSON.stringify(p.text),
        });
  } else {
    console.log("Unknown model provider", p.model);
    return undefined;
  }
}

function openAiChatTokenCount(params: TokenCalculationParams) {
  let encoding: Tiktoken;
  try {
    encoding = encoding_for_model(params.model);
  } catch (KeyError) {
    console.log("Warning: model not found. Using cl100k_base encoding.");
    encoding = get_encoding("cl100k_base");
  }
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
        num_tokens += encoding.encode(value).length;
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
  if (p.model.toLowerCase().startsWith("gpt")) {
    return getTokens("cl100k_base", p.text);
  }
  if (p.model.toLowerCase().startsWith("text-davinci")) {
    return getTokens("p50k_base", p.text);
  }
  console.log("Unknown model", p.model);
  return undefined;
};

const claudeStringTokenCount = (p: { model: string; text: string }) => {
  return countTokens(p.text);
};

const getTokens = (name: TiktokenEncoding, text: string) => {
  const encoding = get_encoding(name);
  const tokens = encoding.encode(text);
  encoding.free();
  return tokens.length;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isClaudeModel(model: string) {
  return model.toLowerCase().startsWith("claude");
}

function isOpenAiModel(model: string): model is TiktokenModel {
  return (
    [
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
      "gpt-3.5",
      "gpt-3.5-turbo",
      "gpt-3.5-turbo-0301",
      "gpt-3.5-turbo-0613",
      "gpt-3.5-turbo-16k",
      "gpt-3.5-turbo-16k-0613",
    ].find((m) => m === model) !== undefined
  );
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

export function calculateTokenCost(
  pricingList: Pricing[],
  input: {
    model: string;
    totalTokens: Decimal;
    promptTokens: Decimal;
    completionTokens: Decimal;
  },
): Decimal | undefined {
  const pricing = pricingList.filter((p) => p.modelName === input.model);

  if (!pricing || pricing.length === 0) {
    console.log("no pricing found for model", input.model);
    return undefined;
  } else {
    if (pricing.length === 1 && pricing[0]?.tokenType === "TOTAL") {
      return calculateValue(pricing[0].price, input.totalTokens);
    }

    if (pricing.length === 2) {
      let promptPrice: Decimal = new Decimal(0);
      let completionPrice: Decimal = new Decimal(0);

      const promptPricing = pricing.find((p) => p.tokenType === "PROMPT");
      const completionPricing = pricing.find(
        (p) => p.tokenType === "COMPLETION",
      );

      if (promptPricing) {
        promptPrice = calculateValue(promptPricing.price, input.promptTokens);
      }

      if (completionPricing) {
        completionPrice = calculateValue(
          completionPricing.price,
          input.completionTokens,
        );
      }

      return promptPrice.plus(completionPrice);
    }
    console.log("unknown model", input.model);
    return undefined;
  }
}

const calculateValue = (price: Decimal, tokens: Decimal) => {
  return price.times(tokens.dividedBy(new Decimal(1000))).toDecimalPlaces(5);
};
