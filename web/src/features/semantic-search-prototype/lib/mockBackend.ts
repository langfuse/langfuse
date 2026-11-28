import {
  type AskAiInterpretation,
  type SearchMode,
  type TopicSearchStatus,
} from "../types";
import {
  FULL_COVERAGE,
  KEYWORD_MATCHES,
  LOGIN_MATCHES,
  REFUND_MATCHES,
} from "./fixtures";

/**
 * Stands in for the future search endpoint: embed the query, rank topic
 * summaries by cosine distance. Answers synchronously so stories stay stable.
 */
export function mockTopicSearch(
  mode: SearchMode,
  query: string,
): TopicSearchStatus {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return { kind: "idle" };
  if (mode === "keyword") {
    const matches = KEYWORD_MATCHES.filter((match) =>
      match.summary.toLowerCase().includes(normalized),
    );
    return matches.length > 0
      ? { kind: "results", matches, coverage: FULL_COVERAGE }
      : { kind: "empty", coverage: FULL_COVERAGE };
  }
  if (/refund|card|money/.test(normalized)) {
    return {
      kind: "results",
      matches: REFUND_MATCHES,
      coverage: FULL_COVERAGE,
    };
  }
  if (/login|locked|2fa|phone|password/.test(normalized)) {
    return { kind: "results", matches: LOGIN_MATCHES, coverage: FULL_COVERAGE };
  }
  return { kind: "empty", coverage: FULL_COVERAGE };
}

const FILTER_PHRASES: ReadonlyArray<{ pattern: RegExp; token: string }> = [
  {
    pattern: /\bin production\b|\bproduction\b|\bprod\b/,
    token: "env:production",
  },
  { pattern: /\berrors?\b|\bfailed\b|\bfailing\b/, token: "level:ERROR" },
  { pattern: /\btoday\b|\blast 24 ?h(ours)?\b/, token: "timestamp:>now-24h" },
];

const FILLER =
  /\b(show|find|me|traces?|where|the|from|with|about|that|and|in|of)\b/g;

/**
 * Splits a prompt into the parts the filter grammar can express and a
 * leftover phrase searched by meaning. The real version is a model call.
 */
export function mockInterpretPrompt(
  prompt: string,
  facetId: string,
): AskAiInterpretation {
  let rest = prompt.toLowerCase();
  const filters: string[] = [];
  for (const { pattern, token } of FILTER_PHRASES) {
    if (pattern.test(rest)) {
      filters.push(token);
      rest = rest.replace(pattern, " ");
    }
  }
  const text = rest.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  return {
    filters,
    semantic:
      text.length > 0 ? { text, facetId, coverage: FULL_COVERAGE } : null,
    semanticUnavailable: false,
    estimatedMatches: text.length > 0 ? 214 : 2_904,
  };
}
