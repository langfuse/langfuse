import { z } from "zod/v4";

const MARKDOWN_PATTERNS = [
  "(\\*\\*?|__?)(.*?)\\1", // Matches bold (** or __) and italic (* or _) with proper escaping
  "`{3}[\\s\\S]*?`{3}", // Matches fenced code blocks with triple backticks
  "`[\\s\\S]*?`", // Matches inline code with single backticks
  "(^|\\s)[-+*]\\s", // Matches unordered lists that start with -, +, or *
  "^\\s*#{1,6}\\s", // Matches headers that start with # to ######
  "^>\\s+", // Matches blockquotes starting with >
  "^\\d+\\.\\s", // Matches ordered lists starting with 1. or 2. etc
  "!\\[.*?\\]\\(.*?\\)", // Matches images ![Alt text](URL)
  "\\[.*?\\]\\(.*?\\)", // Matches links [Link text](URL)
].join("|");

const MARKDOWN_REGEX = new RegExp(MARKDOWN_PATTERNS, "gm");

export function containsAnyMarkdown(...texts: string[]): boolean {
  MARKDOWN_REGEX.lastIndex = 0;
  return texts.some((text) => MARKDOWN_REGEX.test(text));
}

const MarkdownSchema = z.string().refine(containsAnyMarkdown);

export const StringOrMarkdownSchema = z.union([z.string(), MarkdownSchema]);
