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
  [key: string]: string | undefined;
};

type TokenCalculationParams = {
  messages: ChatMessage[];
  isReply: boolean;
  model: TiktokenModel;
};

function numTokensFromMessages(params: TokenCalculationParams) {
  let encoding: Tiktoken;
  try {
    encoding = encoding_for_model(params.model);
  } catch (KeyError) {
    console.log("Warning: model not found. Using cl100k_base encoding.");
    encoding = get_encoding("cl100k_base");
  }
  let tokens_per_message = 0;
  let tokens_per_name = 0;
  if (params.model == "gpt-3.5-turbo") {
    return numTokensFromMessages({ ...params, model: "gpt-3.5-turbo-0301" });
  } else if (params.model == "gpt-4") {
    return numTokensFromMessages({ ...params, model: "gpt-4-0314" });
  } else if (params.model == "gpt-3.5-turbo-0301") {
    tokens_per_message = 4; // every message follows <|start|>{role/name}\n{content}<|end|>\n
    tokens_per_name = -1; // if there's a name, the role is omitted
  } else if (params.model == "gpt-4-0314") {
    tokens_per_message = 3;
    tokens_per_name = 1;
  } else {
    throw new Error(
      `num_tokens_from_messages() is not implemented for model {model}. See https://github.com/openai/openai-python/blob/main/chatml.md for information on how messages are converted to tokens.`,
    );
  }
  let num_tokens = 0;
  params.messages.forEach((message) => {
    num_tokens += tokens_per_message;

    Object.keys(message).forEach((key) => {
      const value = message[key];
      if (value) {
        num_tokens += encoding.encode(value).length;
      }
      if (key === "name") {
        num_tokens += tokens_per_name;
      }
    });
  });
  num_tokens += 3; // every reply is primed with <| start |> assistant <| message |>
  return num_tokens + (params.isReply ? -8 : 0);
}

export function stringTokenCount(p: {
  model: string;
  text: string;
}): number | undefined {
  if (!p.model || !p.text) return undefined;

  if (p.model.toLowerCase().startsWith("gpt")) {
    return getTokens("cl100k_base", p.text);
  }
  if (p.model.toLowerCase().startsWith("text-davinci")) {
    return getTokens("p50k_base", p.text);
  }
  if (p.model.toLowerCase().startsWith("claude")) {
    return countTokens(p.text);
  }
  console.log("Unknown model", p.model);
  return undefined;
}

const getTokens = (name: TiktokenEncoding, text: string) => {
  const encoding = get_encoding(name);
  const tokens = encoding.encode(text);
  encoding.free();
  return tokens.length;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isValidModel(value: string): value is TiktokenModel {
  return value in [
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
     "gpt-3.5-turbo-0301",
     "gpt-3.5-turbo-0613",
     "gpt-3.5-turbo-16k",
     "gpt-3.5-turbo-16k-0613",
  ]

function isChatMessageArray(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every(
    (item) =>
      typeof item.role === "string" &&
      typeof item.content === "string" &&
      (typeof item.name === "string" || typeof item.name === "undefined"),
  );
}

export function tokenCount(p: {
  model: string;
  text: unknown;
  isReply: boolean;
}): number | undefined {
  if (isString(p.text)) {
    return stringTokenCount({ model: p.model, text: p.text });
  } else if (isChatMessageArray(p.text)) {
    if (!isValidModel(p.model)) {
      console.log("Unknown model", p.model);
      return undefined;
    }
    return numTokensFromMessages({
      model: p.model,
      messages: p.text,
      isReply: p.isReply,
    });
  } else {
    console.log("It is neither a string nor a ChatMessage array");
  }
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

