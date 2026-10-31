/** One trace returned by a search over topic summaries. */
export type SemanticMatch = {
  traceId: string;
  /** The facet summary the query was compared against. */
  summary: string;
  /** `null` for outliers: the trace has a summary but no topic. */
  topicId: string | null;
  topicName: string | null;
  /** `1 - cosineDistance(query, summary)`; `null` for keyword matches. */
  similarity: number | null;
  seenAt: string;
};

/** How many traces in the current range have an embedded summary. */
export type EmbeddingCoverage = {
  embedded: number;
  total: number;
};

export type SearchMode = "keyword" | "meaning";

export type TopicSearchStatus =
  | { kind: "idle" }
  | { kind: "searching" }
  | {
      kind: "results";
      matches: SemanticMatch[];
      coverage: EmbeddingCoverage;
    }
  | { kind: "empty"; coverage: EmbeddingCoverage }
  | { kind: "unavailable" }
  | { kind: "error" };

export type FacetOption = {
  id: string;
  label: string;
};

/** The part of an Ask AI prompt that is searched by meaning, not by filter. */
export type SemanticClause = {
  text: string;
  facetId: string;
  coverage: EmbeddingCoverage;
};

export type AskAiInterpretation = {
  /** Grammar tokens exactly as the search bar would show them. */
  filters: string[];
  /** `null` when the prompt is fully expressible as filters. */
  semantic: SemanticClause | null;
  /** Set when the prompt asked for meaning but the project cannot serve it. */
  semanticUnavailable: boolean;
  estimatedMatches: number;
};

export type AskAiSemanticStatus =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "preview"; interpretation: AskAiInterpretation }
  | { kind: "error"; message: string };
