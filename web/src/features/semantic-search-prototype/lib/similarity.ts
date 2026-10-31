import { type EmbeddingCoverage, type SemanticMatch } from "../types";

type SimilarityBand = { label: "Strong" | "Close" | "Loose"; percent: number };

/**
 * Raw cosine scores mean little to users and shift between embedding models,
 * so the UI shows a coarse band and keeps the number for the tooltip.
 */
export function similarityBand(similarity: number): SimilarityBand {
  const percent = Math.round(similarity * 100);
  if (similarity >= 0.85) return { label: "Strong", percent };
  if (similarity >= 0.7) return { label: "Close", percent };
  return { label: "Loose", percent };
}

export type TopicGroup = {
  topicId: string | null;
  topicName: string;
  count: number;
};

/** Where the matches land, most matches first; outliers are their own group. */
export function groupMatchesByTopic(matches: SemanticMatch[]): TopicGroup[] {
  const groups = new Map<string | null, TopicGroup>();
  for (const match of matches) {
    const group = groups.get(match.topicId) ?? {
      topicId: match.topicId,
      topicName: match.topicName ?? "Outliers",
      count: 0,
    };
    group.count += 1;
    groups.set(match.topicId, group);
  }
  return [...groups.values()].toSorted((a, b) => b.count - a.count);
}

export function coveragePercent(coverage: EmbeddingCoverage): number {
  if (coverage.total === 0) return 0;
  return Math.round((coverage.embedded / coverage.total) * 100);
}

/** Below this share, results visibly miss traces and the UI says so. */
export const LOW_COVERAGE_PERCENT = 80;
