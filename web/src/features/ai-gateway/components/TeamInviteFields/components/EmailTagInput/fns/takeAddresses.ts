import { z } from "zod/v4";

const EXPLICIT_SEPARATOR = /[,;]/;
const WHITESPACE = /\s+/;

function isValidEmail(text: string) {
  return z.email().safeParse(text).success;
}

/**
 * Addresses in a chunk the user ended with a comma, Enter, or blur. When no word
 * is an address on its own, the fragments touching the `@` are joined
 * (`ada@ x.com`, `ada @x.com`); other words stay, so a search word in front is
 * not glued into the address.
 */
function parseEndedChunk(chunk: string) {
  const words = chunk.split(WHITESPACE).filter((word) => word.length > 0);
  const atIndex = words.findIndex((word) => word.includes("@"));
  if (atIndex !== -1 && !words.some(isValidEmail)) {
    const atWord = words[atIndex]!;
    const start = atWord.startsWith("@") ? Math.max(atIndex - 1, 0) : atIndex;
    const end = atWord.endsWith("@") ? atIndex + 1 : atIndex;
    const joined = words.slice(start, end + 1).join("");
    if (isValidEmail(joined)) {
      return {
        addresses: [joined],
        leftover: [...words.slice(0, start), ...words.slice(end + 1)],
      };
    }
  }
  return {
    addresses: words.filter((word) => word.includes("@")),
    leftover: words.filter((word) => !word.includes("@")),
  };
}

/** Addresses a space already ended in the chunk still being typed. */
function parseTypingChunk(chunk: string) {
  const words = chunk.split(WHITESPACE);
  const typingWord = words.pop() ?? "";
  const endedWords = words.filter((word) => word.length > 0);
  return {
    addresses: endedWords.filter(isValidEmail),
    leftover: [...endedWords.filter((word) => !isValidEmail(word)), typingWord],
  };
}

/**
 * Splits the input's text into addresses to turn into chips and the text that
 * stays in the input, so stray commas and spaces never cut an address.
 *
 * While typing (`isTyping`), a comma or semicolon ends an address, and a space
 * ends it only once it is valid; the rest stays as typed. Otherwise (Enter,
 * blur) everything with an `@` becomes a chip. Text without an `@` always stays,
 * since it is a member search.
 */
export function takeAddresses(
  text: string,
  { isTyping }: { isTyping: boolean },
) {
  const chunks = text.split(EXPLICIT_SEPARATOR);
  const typingChunk = isTyping ? (chunks.pop() ?? "") : undefined;
  const parts = chunks.map(parseEndedChunk);
  if (typingChunk !== undefined) parts.push(parseTypingChunk(typingChunk));

  const addresses = parts.flatMap((part) => part.addresses);
  if (addresses.length === 0) return { addresses, rest: text };
  return {
    addresses,
    rest: parts.flatMap((part) => part.leftover).join(" "),
  };
}
