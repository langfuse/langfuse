// Builds the "project data context" block injected into the v4 AI-filter prompt
// so the model maps natural language onto the project's ACTUAL columns, values,
// and metadata keys — instead of guessing (e.g. `type:chat` or
// `traceName:membership-support`). Reuses data already loaded for the bar:
// observed filter values (from `filterOptions`) + metadata keys sampled from the
// currently visible rows + the current result count (empty-state awareness).
//
// Everything is capped so the added context stays small (window/cost).

import type { ObservedOptions } from "./observed-options";

// Columns whose observed values help map a phrase to the right column/value.
// High-cardinality ids (userId/sessionId/id) are excluded — too many to list and
// the user types those verbatim anyway.
const VALUE_COLUMNS: Array<{ col: string; label: string }> = [
  { col: "type", label: "type" },
  { col: "level", label: "level" },
  { col: "environment", label: "environment" },
  { col: "traceName", label: "traceName" },
  { col: "name", label: "name" },
  { col: "traceTags", label: "traceTags (tags)" },
  { col: "providedModelName", label: "providedModelName (model)" },
  { col: "promptName", label: "promptName" },
  { col: "scores_avg", label: "scores.<name> (numeric)" },
  { col: "score_categories", label: "scores.<name> (categorical)" },
  { col: "trace_scores_avg", label: "traceScores.<name> (numeric)" },
  { col: "trace_score_categories", label: "traceScores.<name> (categorical)" },
];

const MAX_VALUES_PER_COL = 25;
const MAX_METADATA_KEYS = 30;
const MAX_VALUE_LEN = 40;

/** Flatten nested metadata into dot-path keys with one example leaf value. */
function collectMetadataKeys(
  md: unknown,
  prefix: string,
  out: Map<string, string>,
  depth: number,
): void {
  if (depth > 3 || out.size >= MAX_METADATA_KEYS) return;
  if (md === null || typeof md !== "object" || Array.isArray(md)) return;
  for (const [k, v] of Object.entries(md as Record<string, unknown>)) {
    if (out.size >= MAX_METADATA_KEYS) break;
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      collectMetadataKeys(v, path, out, depth + 1);
    } else if (!out.has(path)) {
      const example =
        v === null || v === undefined || Array.isArray(v)
          ? ""
          : String(v).slice(0, MAX_VALUE_LEN);
      out.set(path, example);
    }
  }
}

export function buildAiContext(args: {
  observed: ObservedOptions | undefined;
  /** Metadata objects from the currently visible rows (sampled by the caller). */
  sampleMetadata: unknown[];
  /** Number of currently-loaded/visible rows (so the model can warn when 0). */
  resultCount: number | null;
}): string | undefined {
  const { observed, sampleMetadata, resultCount } = args;
  const sections: string[] = [];

  if (observed) {
    const valueLines: string[] = [];
    for (const { col, label } of VALUE_COLUMNS) {
      const vals = (observed[col] ?? [])
        .map((o) => o.value)
        .filter((v) => v.length > 0)
        .slice(0, MAX_VALUES_PER_COL);
      if (vals.length > 0) valueLines.push(`- ${label}: ${vals.join(", ")}`);
    }
    if (valueLines.length > 0) {
      sections.push(
        [
          "Observed values per column (use these exact values; lists may be truncated):",
          ...valueLines,
        ].join("\n"),
      );
    }
  }

  const mdKeys = new Map<string, string>();
  for (const md of sampleMetadata) {
    collectMetadataKeys(md, "", mdKeys, 0);
    if (mdKeys.size >= MAX_METADATA_KEYS) break;
  }
  if (mdKeys.size > 0) {
    const keyLines = [...mdKeys.entries()].map(
      ([k, ex]) => `- metadata.${k}${ex ? ` (e.g. "${ex}")` : ""}`,
    );
    sections.push(
      [
        "Observed metadata keys (filter as metadata.<key>; match the user's phrase to one of these):",
        ...keyLines,
      ].join("\n"),
    );
  }

  if (resultCount !== null) {
    sections.push(
      resultCount === 0
        ? "The current filters match no visible rows — they may be too strict; consider broadening."
        : `The current view is showing ${resultCount} row(s).`,
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : undefined;
}
