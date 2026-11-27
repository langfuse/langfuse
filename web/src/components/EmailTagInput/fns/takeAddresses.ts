import { isEmail } from "@/src/utils/isEmail";

/** Commas and semicolons, and the line and cell breaks of a pasted column or row. */
const EXPLICIT_SEPARATOR = /[,;\r\n\t]/;
const WHITESPACE = /\s+/;
/** Quoted text: a display name that may hold a separator (`"Ross, Bob" <bob@acme.example>`), or a CSV cell. */
const QUOTED = /"([^"]*)"/g;
/** An email client's `Name <address>` form; splitting on it puts the addresses at the odd indexes. */
const BRACKETED_ADDRESS = /<\s*([^<>\s]*@[^<>\s]*)\s*>/;

/** Drops a quoted display name so its separators don't split it; quoted text with an `@` stays. */
const unquote = (_match: string, inner: string) =>
  inner.includes("@") ? ` ${inner} ` : " ";

const wordsOf = (text: string) =>
  text.split(WHITESPACE).filter((word) => word.length > 0);
const hasAt = (word: string) => word.includes("@");

/**
 * Addresses in a chunk that a separator, Enter, blur or a paste ended. Fragments
 * touching an `@` are joined (`ada@ x.com`, `ada @x.com`); other words stay, so
 * a search word in front is not glued into the address.
 */
function parseEndedChunk(chunk: string) {
  const segments = chunk.split(BRACKETED_ADDRESS);
  if (segments.length > 1) {
    const trailing = wordsOf(segments.pop()!);
    return {
      // Words before a bracket are its display name, except addresses of their own.
      addresses: [
        ...segments.flatMap((segment, index) =>
          index % 2 === 1 ? [segment] : wordsOf(segment).filter(hasAt),
        ),
        ...trailing.filter(hasAt),
      ],
      leftover: trailing.filter((word) => !hasAt(word)),
    };
  }
  const words = wordsOf(chunk);
  const addresses: string[] = [];
  const leftover: string[] = [];
  for (let index = 0; index < words.length; index++) {
    const split = takeSplitAddress(words, index);
    if (split) {
      addresses.push(split.address);
      index += split.wordCount - 1;
    } else if (hasAt(words[index]!)) {
      addresses.push(words[index]!);
    } else {
      leftover.push(words[index]!);
    }
  }
  return { addresses, leftover };
}

/** An address that stray spaces cut around its `@`, starting at this word: up to three words that only join into one. */
function takeSplitAddress(words: string[], index: number) {
  if (isEmail(words[index]!)) return undefined;
  for (const wordCount of [2, 3]) {
    const fragments = words.slice(index, index + wordCount);
    const cutsAtTheAt = fragments
      .slice(1)
      .every(
        (fragment, at) =>
          fragment.startsWith("@") || fragments[at]!.endsWith("@"),
      );
    const address = fragments.join("");
    if (fragments.length === wordCount && cutsAtTheAt && isEmail(address)) {
      return { address, wordCount };
    }
  }
  return undefined;
}

/** Addresses a space already ended in the chunk still being typed. */
function parseTypingChunk(chunk: string) {
  const words = chunk.split(WHITESPACE);
  const typingWord = words.pop() ?? "";
  const endedWords = words.filter((word) => word.length > 0);
  return {
    addresses: endedWords.filter(isEmail),
    leftover: [...endedWords.filter((word) => !isEmail(word)), typingWord],
  };
}

/**
 * Splits the input's text into addresses to turn into chips and the text that
 * stays in the input, so stray commas and spaces never cut an address.
 * - `typing`: a separator ends an address, a space only once it is valid.
 * - `ended` (Enter, blur): everything with an `@` becomes a chip.
 * - `pasted`: as `ended`, and the names around the addresses are dropped.
 * Text without any address stays as it is.
 */
export function takeAddresses(
  text: string,
  how: "typing" | "ended" | "pasted",
) {
  const chunks = text.replace(QUOTED, unquote).split(EXPLICIT_SEPARATOR);
  const typingChunk = how === "typing" ? (chunks.pop() ?? "") : undefined;
  const parts = chunks.map(parseEndedChunk);
  if (typingChunk !== undefined) parts.push(parseTypingChunk(typingChunk));

  const addresses = parts.flatMap((part) => part.addresses);
  if (addresses.length === 0) return { addresses, rest: text };
  return {
    addresses,
    rest:
      how === "pasted" ? "" : parts.flatMap((part) => part.leftover).join(" "),
  };
}
