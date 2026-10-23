import type { Integration } from "./types";

/** Shown when a search finds nothing and has no near misses. */
export const POPULAR_SLUGS = [
  "openai-py",
  "langchain",
  "vercel-ai-sdk",
  "litellm-sdk",
];

/** The logos on the page's "works with" row. */
export const FEATURED_SLUGS = [
  "openai-py",
  "langchain",
  "vercel-ai-sdk",
  "llamaindex",
  "anthropic",
  "litellm-sdk",
  "mastra",
  "opentelemetry",
];

/** An integration with what a search reads of it, worked out once. */
export type SearchEntry = {
  integration: Integration;
  /** Its name, category title and description, lowercased, minus "Langfuse", which nearly every description mentions. */
  text: string;
  /** Its name as one squashed word plus each of its words longer than two letters. */
  nameWords: string[];
};

function nameWordsOf(name: string) {
  const lower = name.toLowerCase();
  return [
    lower.replace(/[^a-z0-9]/g, ""),
    ...lower.split(/[^a-z0-9]+/).filter((word) => word.length > 2),
  ];
}

/** The search entries for a catalog; build it once per catalog, not per query. */
export function searchIndexOf(
  integrations: Integration[],
  categoryTitles: Record<string, string>,
): SearchEntry[] {
  return integrations.map((integration) => ({
    integration,
    text: [
      integration.name,
      categoryTitles[integration.category] ?? "",
      integration.description.replace(/langfuse/gi, ""),
    ]
      .join(" ")
      .toLowerCase(),
    nameWords: nameWordsOf(integration.name),
  }));
}

/** Integrations in `category` (or all, with `null`) whose name, category or description contains the query. */
export function searchIntegrations(
  index: SearchEntry[],
  query: string,
  category: string | null,
) {
  const needle = query.trim().toLowerCase();
  return index
    .filter(
      ({ integration, text }) =>
        (category === null || integration.category === category) &&
        text.includes(needle),
    )
    .map(({ integration }) => integration);
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (const [i, charA] of [...a].entries()) {
    const previous = [...row];
    row[0] = i + 1;
    for (const [j, charB] of [...b].entries()) {
      row[j + 1] = Math.min(
        (previous[j + 1] ?? 0) + 1,
        (row[j] ?? 0) + 1,
        (previous[j] ?? 0) + (charA === charB ? 0 : 1),
      );
    }
  }
  return row[b.length] ?? 0;
}

/** Up to three integrations whose name, or a word of it, is a typo or two away from the query. */
export function nearMisses(index: SearchEntry[], query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 3) return [];
  const allowed = needle.length < 5 ? 1 : 2;
  return index
    .map(({ integration, nameWords }) => ({
      integration,
      distance: Math.min(
        ...nameWords.map((word) =>
          editDistance(needle, word.slice(0, needle.length + 2)),
        ),
      ),
    }))
    .filter(({ distance }) => distance <= allowed)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ integration }) => integration);
}
