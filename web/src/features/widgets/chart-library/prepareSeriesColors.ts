/**
 * Preparer (data -> visualiser seam): decides the COLOR of every series, so no
 * chart component re-derives it (manifesto V6 — "color is identity").
 *
 * Two-signal semantic recognition, so production-health charts read correctly
 * without any per-widget configuration (LFE-15467):
 *
 * 1. A UNIVERSAL vocabulary of status words whose meaning is unambiguous in
 *    any dimension (`ERROR`, `WARN`, `SUCCESS`, `HEALTHY`, ...) always maps to
 *    the reserved status colors.
 * 2. FIELD-GATED vocabularies unlock only when the caller says which semantic
 *    field the dimension values come from (`semanticContext.field`): the
 *    observation `level` vocabulary (incl. the OTel aliases the ingestion
 *    layer accepts — see OBSERVATION_LEVEL_ALIASES in
 *    `@langfuse/shared`'s OtelIngestionProcessor) and the categorical-score
 *    verdict vocabulary (grounded in the most-adopted production score
 *    values). Words that are ambiguous outside their field never match without
 *    the gate: `DEFAULT` is a level, but also the default environment name.
 *
 * Matching is exact on the trimmed, upper-cased value — never substring — so
 * unrelated values (language codes, entity names) can't false-match.
 *
 * Boolean verdicts (`True`/`False`) carry no polarity of their own — it lives
 * in the score NAME (`hallucination: True` is bad, `is_helpful: True` is
 * good). They only color when `semanticContext.scoreName` matches a curated
 * polarity keyword list; unknown score names leave them on the categorical
 * rotation rather than risking an inverted signal.
 *
 * Non-semantic series keep today's palette rotation. When a chart contains at
 * least one status-colored series, the rotation narrows to the slots that
 * cannot impersonate a status hue; NEUTRAL matches (n/a, unknown, debug) tint
 * themselves gray without narrowing anything, so the ubiquitous null bucket
 * never repaints its chart.
 *
 * Returned colors are complete CSS color strings — either
 * `hsl(var(--chart-N))` (the palette slots are HSL triplets) or
 * `var(--chart-status-*)` (the status tokens are full colors). Consumers use
 * them verbatim; wrapping a status token in `hsl()` would silently render
 * black.
 */

export type SeriesStatus = "error" | "warning" | "ok" | "neutral";

export type SemanticSeriesField = "level" | "score-categorical";

export interface SeriesSemanticContext {
  /** Which semantic vocabulary the dimension values belong to, when known. */
  field?: SemanticSeriesField;
  /**
   * The score name behind categorical values, when the chart shows exactly
   * one score. Unlocks polarity inference for `True`/`False`.
   */
  scoreName?: string;
}

const STATUS_COLOR: Record<SeriesStatus, string> = {
  error: "var(--chart-status-error)",
  warning: "var(--chart-status-warning)",
  ok: "var(--chart-status-ok)",
  neutral: "var(--chart-status-neutral)",
};

/** The 8-slot chart palette, cycled by series index (matches the series fills). */
export const seriesColor = (index: number): string =>
  `hsl(var(--chart-${(index % 8) + 1}))`;

/**
 * Palette slots that stay in rotation next to status-colored series: blue,
 * cyan, purple, pink. The withheld slots read as a status at a glance —
 * chart-3 (gray), chart-5 (yellow), chart-6 (red), chart-7 (green) — and a
 * categorical series must never impersonate one (a reserved-color rule).
 */
const NON_STATUS_SLOTS = [1, 2, 4, 8] as const;

const asVocabulary = (
  entries: Partial<Record<SeriesStatus, readonly string[]>>,
): Map<string, SeriesStatus> => {
  const map = new Map<string, SeriesStatus>();
  for (const [status, values] of Object.entries(entries)) {
    for (const value of values ?? []) map.set(value, status as SeriesStatus);
  }
  return map;
};

// Words with one meaning wherever they appear. Kept deliberately short —
// every entry here widens the false-positive surface for every dimension in
// the product (a trace or environment literally named like a status still
// colors, which is intended; anything less clear-cut belongs behind a gate).
const UNIVERSAL_VOCABULARY = asVocabulary({
  error: [
    "ERROR",
    "FATAL",
    "CRITICAL",
    "FAIL",
    "FAILED",
    "FAILURE",
    "TIMEOUT",
    "UNHEALTHY",
  ],
  warning: ["WARNING", "WARN", "DEGRADED"],
  ok: ["SUCCESS", "SUCCEEDED", "OK", "PASS", "PASSED", "HEALTHY"],
  // The null bucket ("n/a" from the widget transform, "Unknown" from the pie
  // fallback) is not an identity — gray it everywhere.
  neutral: ["N/A", "UNKNOWN"],
});

// Observation `level`: the enum plus the foreign aliases ingestion accepts
// (and which persist raw in pre-normalization rows, LFE-14567). DEFAULT is
// green per the tracing status-facet convention — inside a level breakdown it
// means "nothing wrong", and gray would collapse it into DEBUG.
const LEVEL_VOCABULARY = asVocabulary({
  ok: ["DEFAULT", "INFO", "LOG", "NOTICE"],
  neutral: ["DEBUG", "TRACE", "VERBOSE"],
});

// Categorical score verdicts, grounded in the most project-adopted production
// values (LFE-15467 research). Only meaningful when we know the values are
// verdicts, hence the gate.
const SCORE_VOCABULARY = asVocabulary({
  ok: [
    "CORRECT",
    "POSITIVE",
    "GOOD",
    "ACCEPTED",
    "APPROVED",
    "RESOLVED",
    "COMPLETED",
    "GROUNDED",
    "FAITHFUL",
    "RELEVANT",
    "CLEAN",
  ],
  error: [
    "INCORRECT",
    "NEGATIVE",
    "BAD",
    "POOR",
    "REJECTED",
    "HALLUCINATED",
    "IRRELEVANT",
    "TOXIC",
    "UNSAFE",
  ],
  warning: ["PARTIAL", "PARTIALLY RELEVANT", "PARTIALLY CORRECT", "BORDERLINE"],
  neutral: [
    "NONE",
    "OTHER",
    "NOT_APPLICABLE",
    "NOT APPLICABLE",
    "NEUTRAL",
    "SKIPPED",
    "CANCELLED",
    "CANCELED",
  ],
});

/**
 * Score-name keywords whose boolean `True` means something went WRONG (so
 * True -> error, False -> ok). Checked before the positive list so negated
 * stems (`unsafe`, `invalid`, `incorrect`) never match their positive root.
 * Substring match on the normalized score name — names are compound
 * ("contains_pii", "hallucination_check"), values are not. Grounded in the
 * top production boolean score names by project adoption (LFE-15467
 * research CSVs on the ticket).
 */
const NEGATIVE_SCORE_NAME_KEYWORDS = [
  "HALLUCINAT",
  "TOXIC",
  "ERROR",
  "PII",
  "LEAK",
  "VIOLAT",
  "HARMFUL",
  "UNSAFE",
  "INVALID",
  "INCORRECT",
  "UNHELPFUL",
  // Negated stems must cover every word-form variant, or a noun form falls
  // through to its positive root and INVERTS polarity ("irrelevance" contains
  // RELEVAN): stem the negation at least as short as the positive stem.
  "IRRELEVAN",
  "UNFAITHFUL",
  "INACCURA",
  "INCOHEREN",
  "NONCOMPLIAN",
  "NON-COMPLIAN",
  "NON_COMPLIAN",
  "UNSUCCESS",
  "UNGROUNDED",
  "INJECTION",
  "JAILBREAK",
  "PROFANIT",
  "FLAGGED",
  "SPAM",
  "NSFW",
  "FAIL",
  "MISMATCH",
  "UNANSWERED",
  "INCOMPLETE",
  "DISAGREE",
  "OUT-OF-SCOPE",
  "OUT_OF_SCOPE",
  "OUT OF SCOPE",
  "DISTRESS",
  "FORBIDDEN",
  "ALL_CAPS",
  "ALL CAPS",
  // NOT here despite production adoption: escalated, fallback, blocked —
  // for those, `True` can mean the system working as designed (a guardrail
  // blocking IS success). Intent-dependent polarity fails the confidence bar
  // for automatic coloring; the eventual per-widget override is their home.
];

/** Score-name keywords whose boolean `True` means things are RIGHT. */
const POSITIVE_SCORE_NAME_KEYWORDS = [
  "CORRECT",
  "ACCURA",
  "HELPFUL",
  "RELEVAN",
  "FAITHFUL",
  "GROUNDED",
  "SAFE",
  "VALID",
  "SUCCESS",
  "PASS",
  "COMPLIAN",
  "COHEREN",
  "FEEDBACK",
  "THUMBS",
  "MATCH",
  "ANSWERED",
  "COMPLETE",
  // NOT here despite production adoption: cache_hit (a miss would render
  // error-red via the inverse branch — misses aren't errors) and assert
  // (polarity inferred from name shape alone). Confidence bar, see above.
];

/**
 * Binary verdict values and whether they affirm the score's concept. Polarity
 * then comes from the score name: `hallucination: yes` is red,
 * `is_helpful: yes` is green.
 */
const BINARY_SCORE_VALUES: Record<string, boolean> = {
  TRUE: true,
  FALSE: false,
  YES: true,
  NO: false,
};

// Deliberately NO high/medium/low handling: direction (severity-like high=bad
// vs quality-like high=good) would have to be inferred from score names we
// have not validated against production. Below the confidence bar for
// automatic coloring until that data exists (LFE-15467 research).

/**
 * Standalone words that negate whatever concept the rest of the name carries
 * ("no_hallucination", "error_free", "without_errors"): the keyword lists
 * would read the concept and INVERT polarity. Inference bails out to
 * uncolored instead — the fail-safe. Matched as whole words so stems like
 * NOTICE or UNANSWERED are unaffected. None of the top production boolean
 * score names contain these, so the guard costs no validated coverage.
 */
const NEGATOR_SCORE_NAME_WORDS = new Set([
  "NO",
  "NOT",
  "NON",
  "WITHOUT",
  "FREE",
  "ZERO",
]);

const normalize = (value: string): string => value.trim().toUpperCase();

const booleanScorePolarity = (
  scoreName: string,
): "good" | "bad" | undefined => {
  const name = normalize(scoreName);
  if (
    name.split(/[^A-Z0-9]+/).some((word) => NEGATOR_SCORE_NAME_WORDS.has(word))
  ) {
    return undefined;
  }
  if (NEGATIVE_SCORE_NAME_KEYWORDS.some((k) => name.includes(k))) return "bad";
  // "VALIDATOR" names are violation detectors, not validity checks — strip
  // the word so its VALID stem can't read as positive (their real polarity,
  // if any, comes from the rest of the name via the lists above).
  const nameForPositive = name.replaceAll("VALIDATOR", "");
  if (POSITIVE_SCORE_NAME_KEYWORDS.some((k) => nameForPositive.includes(k)))
    return "good";
  return undefined;
};

/**
 * The semantic status of a single dimension value, or `undefined` when it has
 * none (then it stays on the categorical rotation). Total for any string —
 * dimension values are user-controlled open strings (LFE-14567).
 */
export function matchSeriesStatus(
  value: string,
  context?: SeriesSemanticContext,
): SeriesStatus | undefined {
  const normalized = normalize(value);

  const universal = UNIVERSAL_VOCABULARY.get(normalized);
  if (universal) return universal;

  if (context?.field === "level") {
    return LEVEL_VOCABULARY.get(normalized);
  }

  if (context?.field === "score-categorical") {
    const gated = SCORE_VOCABULARY.get(normalized);
    if (gated) return gated;

    if (!context.scoreName) return undefined;

    const affirms = BINARY_SCORE_VALUES[normalized];
    if (affirms !== undefined) {
      const polarity = booleanScorePolarity(context.scoreName);
      if (!polarity) return undefined;
      return (polarity === "bad") === affirms ? "error" : "ok";
    }
  }

  return undefined;
}

export type PreparedSeriesColors = {
  /** Resolved CSS color for a series; total (rotation fallback for strays). */
  colorOf: (dimension: string) => string;
  /** The semantic status behind `colorOf`, when there is one. */
  statusOf: (dimension: string) => SeriesStatus | undefined;
  /**
   * True when any series wears a status color (error/warning/ok — neutral
   * doesn't count). Category bar charts use this as their all-or-nothing
   * switch between the uniform metric color and per-category fills.
   */
  hasStatusColor: boolean;
};

/**
 * Resolve every series' color once, in the caller's series order (the order
 * that owned the palette rotation before this preparer existed):
 *
 * - no status-colored series -> non-semantic series keep exactly the color
 *   they had before semantic recognition existed (slot by original index), so
 *   existing dashboards don't repaint;
 * - any status-colored series -> non-semantic series re-rotate over the
 *   non-status slots (by their order among themselves), so nothing beside a
 *   red ERROR wears categorical red. The switch depends on the queried data,
 *   so a series' color can change when an ERROR series enters the window —
 *   accepted: the alternative (a categorical slot impersonating a status) is
 *   worse, and the narrowed palette is itself stable per chart.
 */
export function prepareSeriesColors(
  dimensions: string[],
  context?: SeriesSemanticContext,
): PreparedSeriesColors {
  const statuses = new Map<string, SeriesStatus | undefined>(
    dimensions.map((dimension) => [
      dimension,
      matchSeriesStatus(dimension, context),
    ]),
  );

  const hasStatusColor = [...statuses.values()].some(
    (status) => status !== undefined && status !== "neutral",
  );

  const colors = new Map<string, string>();
  let nonSemanticRank = 0;
  dimensions.forEach((dimension, index) => {
    const status = statuses.get(dimension);
    if (status) {
      colors.set(dimension, STATUS_COLOR[status]);
      return;
    }
    colors.set(
      dimension,
      hasStatusColor
        ? `hsl(var(--chart-${NON_STATUS_SLOTS[nonSemanticRank % NON_STATUS_SLOTS.length]}))`
        : seriesColor(index),
    );
    nonSemanticRank += 1;
  });

  return {
    colorOf: (dimension) =>
      colors.get(dimension) ??
      // A dimension the preparer never saw (shouldn't happen) still gets a
      // deterministic color rather than crashing or going invisible.
      seriesColor(dimensions.length),
    statusOf: (dimension) => statuses.get(dimension),
    hasStatusColor,
  };
}
