/**
 * Text slots. Labels read as prose in sentence case; identifiers (span names, models, run ids) are shown exactly as
 * written. Both are capped in characters, which is exact in monospace, and keep the full text for a tooltip.
 */

export type Slot = { text: string; full: string };

const keepsCase = (word: string) =>
  /[A-Z]/.test(word.slice(1)) || /[\d_\-./@:#]/.test(word);

/** Capitalises the first word and lowercases the rest, except acronyms, versions and code-ish words (LLM, GPT-5, v2, streamText). */
export function sentenceCase(text: string): string {
  return text.replace(/\S+/g, (word, offset: number) => {
    if (keepsCase(word)) return word;
    const lower = word.toLowerCase();
    return offset === 0
      ? lower.charAt(0).toUpperCase() + lower.slice(1)
      : lower;
  });
}

export function truncate(
  text: string,
  max: number,
  at: "end" | "middle" = "end",
): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  if (max <= 1) return "…";
  if (at === "end")
    return `${chars
      .slice(0, max - 1)
      .join("")
      .trimEnd()}…`;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

export const label = (text: string, max: number): Slot => {
  const full = sentenceCase(text.trim());
  return { text: truncate(full, max, "end"), full };
};

export const identifier = (text: string, max: number): Slot => {
  const full = text.trim();
  return { text: truncate(full, max, "middle"), full };
};

export const length = (text: string) => [...text].length;
