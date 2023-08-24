import { type TiktokenEncoding, get_encoding } from "tiktoken";
import { countTokens } from "@anthropic-ai/tokenizer";

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
