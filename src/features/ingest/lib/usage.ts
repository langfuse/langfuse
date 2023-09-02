import { type TiktokenEncoding, get_encoding } from "tiktoken";
import { countTokens } from "@anthropic-ai/tokenizer";
import { type Pricing } from "@prisma/client";
import { Decimal } from "decimal.js";

export function tokenCount(p: {
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

export function calculateTokenCost(
  pricingList: Pricing[],
  input: {
    model: string;
    totalTokens: Decimal;
    promptTokens: Decimal;
    completionTokens: Decimal;
  }
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
        (p) => p.tokenType === "COMPLETION"
      );

      if (promptPricing) {
        promptPrice = calculateValue(promptPricing.price, input.promptTokens);
      }

      if (completionPricing) {
        completionPrice = calculateValue(
          completionPricing.price,
          input.completionTokens
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
