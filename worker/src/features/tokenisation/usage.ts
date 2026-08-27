import { type Tiktoken } from "tiktoken";

interface Tokenizer {
  [model: string]: Tiktoken;
}
const cachedTokenizerByModel: Tokenizer = {};

export function freeAllTokenizers() {
  Object.values(cachedTokenizerByModel).forEach((tokenizer) => {
    tokenizer.free();
  });
}
