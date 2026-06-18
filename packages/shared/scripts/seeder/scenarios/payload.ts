import { Rng } from "./rng";

export type PayloadStyle = "json" | "text" | "malformed" | "unicode";

export const PAYLOAD_STYLES: PayloadStyle[] = [
  "json",
  "text",
  "malformed",
  "unicode",
];

const WORDS = [
  "retrieval",
  "latency",
  "guardrail",
  "embedding",
  "fallback",
  "router",
  "checkout",
  "invoice",
  "escalation",
  "refund",
  "summarize",
  "classify",
  "rerank",
  "citation",
  "groundedness",
];

const UNICODE_SNIPPETS = [
  "翻訳されたユーザー入力テキスト",
  "مرحبا بالعالم، هذا اختبار",
  "Résumé détaillé — données confirmées",
  "Привет, мир! Тестовые данные",
  "🤖🔍📊 emoji-heavy content 🚀✅❌",
  "𝔘𝔫𝔦𝔠𝔬𝔡𝔢 𝕞𝕒𝕥𝕙 𝖘𝖙𝖞𝖑𝖊𝖉",
  'escaped-looking: \\u00e9\\u4e2d\\ud83d\\ude00 and raw "quotes"',
  "combining: ééé́ ZWJ: 👩‍💻",
];

const sentence = (rng: Rng, words: number): string => {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) parts.push(rng.pick(WORDS));
  return parts.join(" ");
};

const buildJsonPayload = (rng: Rng, targetBytes: number): string => {
  const root: Record<string, unknown> = {
    schemaVersion: 2,
    request: {
      query: sentence(rng, 8),
      filters: { region: rng.pick(["eu", "us", "apac"]), beta: rng.bool() },
    },
    items: [] as unknown[],
  };
  const items = root.items as unknown[];
  let size = JSON.stringify(root).length;
  let index = 0;
  while (size < targetBytes) {
    const item = {
      index,
      id: `item-${index}-${rng.int(1000, 9999)}`,
      score: Math.round(rng.next() * 1000) / 1000,
      status: rng.pick(["ok", "retried", "failed", "skipped"]),
      tags: [rng.pick(WORDS), rng.pick(WORDS)],
      nested: {
        depth1: {
          depth2: {
            note: sentence(rng, rng.int(4, 12)),
            stringifiedJson: JSON.stringify({
              inner: sentence(rng, 3),
              n: index,
            }),
          },
        },
      },
    };
    items.push(item);
    size += JSON.stringify(item).length + 1;
    index++;
  }
  return JSON.stringify(root);
};

const buildTextPayload = (rng: Rng, targetBytes: number): string => {
  const paragraphs: string[] = [];
  let size = 0;
  while (size < targetBytes) {
    const paragraph = `## ${sentence(rng, 3)}\n\n${sentence(rng, rng.int(30, 80))}.`;
    paragraphs.push(paragraph);
    size += paragraph.length + 2;
  }
  return paragraphs.join("\n\n");
};

const buildUnicodePayload = (rng: Rng, targetBytes: number): string => {
  const parts: string[] = [];
  let size = 0;
  while (size < targetBytes) {
    const part = `${rng.pick(UNICODE_SNIPPETS)} ${sentence(rng, 4)}`;
    parts.push(part);
    size += Buffer.byteLength(part) + 1;
  }
  return parts.join("\n");
};

/**
 * Builds a payload string of approximately targetBytes. "malformed" returns
 * intentionally invalid JSON (truncated, unclosed) for JSON-viewer edge cases.
 */
export const buildPayload = (
  style: PayloadStyle,
  targetBytes: number,
  rng: Rng,
): string => {
  switch (style) {
    case "json":
      return buildJsonPayload(rng, targetBytes);
    case "text":
      return buildTextPayload(rng, targetBytes);
    case "unicode":
      return buildUnicodePayload(rng, targetBytes);
    case "malformed": {
      const valid = buildJsonPayload(rng, targetBytes);
      return `${valid.slice(0, Math.floor(valid.length * 0.9))},"unclosed":"tr`;
    }
  }
};
