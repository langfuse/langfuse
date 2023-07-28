import { get_encoding } from "tiktoken";
import { countTokens } from "@anthropic-ai/tokenizer";

export function tokenCount(p: {
  model: string;
  text: string;
}): number | undefined {
  if (!p.model || !p.text) return undefined;
  if (p.model.toLowerCase().startsWith("gpt")) {
    const encoding = get_encoding("cl100k_base");
    const tokens = encoding.encode(p.text);
    encoding.free();
    return tokens.length;
  }
  if (p.model.toLowerCase().startsWith("claude")) {
    return countTokens(p.text);
  }
  console.log("Unknown model", p.model);
  return undefined;
}
