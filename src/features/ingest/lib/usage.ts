import { get_encoding } from "tiktoken";

export function tokenCount(p: {
  model: string;
  text: string;
}): number | undefined {
  console.log("tokenCount", p);
  if (!p.model || !p.text) return undefined;
  if (p.model.toLowerCase().startsWith("gpt")) {
    const encoding = get_encoding("cl100k_base");
    const tokens = encoding.encode(p.text);
    encoding.free();
    return tokens.length;
  }
  if (p.model.toLowerCase().startsWith("claude")) {
    // count characters
    return p.text.split(" ").length;
  }
  console.log("Unknown model", p.model);
  return undefined;
}
