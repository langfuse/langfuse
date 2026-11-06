import {
  type AskAiInterpretation,
  type EmbeddingCoverage,
  type FacetOption,
  type SemanticMatch,
} from "../types";

export const FACETS: FacetOption[] = [
  { id: "intent", label: "Intent" },
  { id: "sentiment", label: "Sentiment" },
];

export const FULL_COVERAGE: EmbeddingCoverage = {
  embedded: 21_110,
  total: 21_110,
};

export const PARTIAL_COVERAGE: EmbeddingCoverage = {
  embedded: 12_840,
  total: 21_110,
};

export const SUGGESTED_QUERIES = [
  "refund to expired card",
  "locked out after changing phone",
  "angry about a late delivery",
];

export const REFUND_MATCHES: SemanticMatch[] = [
  {
    traceId: "tr_8f21c0",
    summary:
      "Refund failed because the card on file expired; asks where the money goes",
    topicId: "refund-status",
    topicName: "Refund status questions",
    similarity: 0.91,
    seenAt: "12 min ago",
  },
  {
    traceId: "tr_3b9e44",
    summary:
      "Asks whether a refund can go to a new card after the old one was cancelled",
    topicId: "refund-status",
    topicName: "Refund status questions",
    similarity: 0.88,
    seenAt: "40 min ago",
  },
  {
    traceId: "tr_c07a12",
    summary: "Card expired before the chargeback finished; wants store credit",
    topicId: null,
    topicName: null,
    similarity: 0.84,
    seenAt: "1 h ago",
  },
  {
    traceId: "tr_51d6fe",
    summary:
      "Refund shows as processed but the bank says the card account is closed",
    topicId: "refund-status",
    topicName: "Refund status questions",
    similarity: 0.82,
    seenAt: "3 h ago",
  },
  {
    traceId: "tr_9ae310",
    summary: "Wants to update the payment card before the renewal is refunded",
    topicId: "billing-address",
    topicName: "Change billing address",
    similarity: 0.74,
    seenAt: "5 h ago",
  },
  {
    traceId: "tr_04bb87",
    summary: "Cancelled the plan and asks how the prorated refund is paid out",
    topicId: "cancel-subscription",
    topicName: "Cancel subscription",
    similarity: 0.69,
    seenAt: "1 d ago",
  },
  {
    traceId: "tr_e6c251",
    summary: "Package lost; asks for the refund to go to a different card",
    topicId: "shipping-delay",
    topicName: "Shipping delay complaints",
    similarity: 0.61,
    seenAt: "2 d ago",
  },
];

export const LOGIN_MATCHES: SemanticMatch[] = [
  {
    traceId: "tr_77f0a9",
    summary: "New phone, old authenticator app gone; cannot pass 2FA",
    topicId: "login-2fa",
    topicName: "Login and 2FA issues",
    similarity: 0.93,
    seenAt: "8 min ago",
  },
  {
    traceId: "tr_2c18d3",
    summary: "Backup codes lost after switching phones; asks for manual reset",
    topicId: "login-2fa",
    topicName: "Login and 2FA issues",
    similarity: 0.87,
    seenAt: "2 h ago",
  },
  {
    traceId: "tr_f9013e",
    summary: "Locked out and wants to cancel before the next charge",
    topicId: "cancel-subscription",
    topicName: "Cancel subscription",
    similarity: 0.66,
    seenAt: "6 h ago",
  },
];

/** Keyword hits for "refund": literal matches, no ranking by meaning. */
export const KEYWORD_MATCHES: SemanticMatch[] = REFUND_MATCHES.filter((match) =>
  match.summary.toLowerCase().includes("refund"),
).map((match) => ({ ...match, similarity: null }));

export const INTERPRETATIONS = {
  filtersAndMeaning: {
    filters: ["env:production", "level:ERROR", "timestamp:>now-24h"],
    semantic: {
      text: "refund to expired card",
      facetId: "intent",
      coverage: FULL_COVERAGE,
    },
    semanticUnavailable: false,
    estimatedMatches: 214,
  },
  meaningOnly: {
    filters: [],
    semantic: {
      text: "customer is angry about a late delivery",
      facetId: "sentiment",
      coverage: FULL_COVERAGE,
    },
    semanticUnavailable: false,
    estimatedMatches: 1_380,
  },
  lowCoverage: {
    filters: ["env:production"],
    semantic: {
      text: "refund to expired card",
      facetId: "intent",
      coverage: PARTIAL_COVERAGE,
    },
    semanticUnavailable: false,
    estimatedMatches: 131,
  },
  topicsNotSetUp: {
    filters: ["env:production", "level:ERROR"],
    semantic: null,
    semanticUnavailable: true,
    estimatedMatches: 2_904,
  },
} satisfies Record<string, AskAiInterpretation>;
