import { z } from "zod";

const MARKDOWN_PATTERNS = [
  "(\\*\\*?|__?)(.*?)\\1", // Matches bold (** or __) and italic (* or _) with proper escaping
  "`{3}[\\s\\S]*?`{3}", // Matches fenced code blocks with triple backticks
  "`[^`]*?`", // Matches inline code with single backticks
  "(^|\\s)[-+*]\\s", // Matches unordered lists that start with -, +, or *
  "^\\s*#{1,6}\\s", // Matches headers that start with # to ######
  "^>\\s+", // Matches blockquotes starting with >
  "^\\d+\\.\\s", // Matches ordered lists starting with 1. or 2. etc
  "!\\[.*?\\]\\(.*?\\)", // Matches images ![Alt text](URL)
  "\\[.*?\\]\\(.*?\\)", // Matches links [Link text](URL)
  "<[^>]+>", // Matches inline HTML tags
  "^\\|(.+\\|)+$", // Matches tables
  "^[-*_]{3,}$", // Matches horizontal rules
  "\\\\.", // Matches escaped characters
  "- \\[ ?\\]", // Matches task lists
].join("|");

const MARKDOWN_REGEX = new RegExp(MARKDOWN_PATTERNS, "gm");

function isMarkdownIncluded(text: string): boolean {
  return MARKDOWN_REGEX.test(text);
}

export function containsAnyMarkdown(...texts: string[]): boolean {
  return texts.some((text) => isMarkdownIncluded(text));
}

export const MarkdownSchema = z.string().refine(containsAnyMarkdown);
