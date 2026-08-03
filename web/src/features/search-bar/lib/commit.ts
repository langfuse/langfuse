// The commit gate, as a pure function (no React, no store).
//
// "Committing" the search bar means: validate the draft text, and if it lowers
// cleanly, produce the flat filter state + full-text search the table consumes.
// This is the single boundary where editor text becomes applied filter state —
// the container calls it and writes the result to the URL filter state (the
// one source of truth). Keeping it pure makes the commit semantics unit-
// testable without rendering anything.

import type { FilterState, TracingSearchType } from "@langfuse/shared";

import type { ASTNode } from "./ast";
import {
  astToFilterState,
  OR_NOT_SUPPORTED_MESSAGE,
  type ScoreTypeContext,
} from "./adapter";
import { serialize, type Diagnostic } from "./langQ";
import { validateQuery } from "./validate";

// The full-text scope a bare query (no scope token) applies: ids & names
// (`id` lane) PLUS input & output (`content` lane). Typing plain text searches
// all of them. `input:`/`output:` narrow to one column; `name:`/`id:` narrow to
// those. `content` here is the backend searchType lane (input ∪ output), not a
// user-typed token — the `content:` grammar token has been removed.
export const DEFAULT_SEARCH_TYPE: TracingSearchType[] = ["id", "content"];

export type CommitResult =
  | {
      status: "committed";
      filters: FilterState;
      searchQuery: string | null;
      searchType: TracingSearchType[];
      /** Canonical serialization of the committed query (for recent searches). */
      canonical: string;
    }
  | { status: "invalid"; diagnostics: Diagnostic[]; ast: ASTNode | null };

/**
 * Validate and lower `draftText`. `committed` carries everything the table
 * needs; `invalid` carries the span-tagged diagnostics for the editor to show.
 * `validateQuery` and `astToFilterState` agree by construction, so a valid
 * draft always lowers without errors. `scoreTypes` (observed score names by
 * type) lets `scores.<name>:<value>` lower to the right column.
 */
export function planCommit(
  draftText: string,
  scoreTypes?: ScoreTypeContext,
): CommitResult {
  const res = validateQuery(draftText.trim(), scoreTypes);
  if (!res.valid) {
    return { status: "invalid", diagnostics: res.diagnostics, ast: res.ast };
  }
  const { filters, searchQuery, searchType, errors } = astToFilterState(
    res.ast,
    scoreTypes,
  );
  // Parity belt-and-suspenders: validateQuery lowers with the same scoreTypes,
  // so a valid draft should never produce lowering errors. If it ever does
  // (a future divergence), refuse to commit rather than silently drop the
  // errored filters — never write a partial result with no signal.
  if (errors.length > 0) {
    return {
      status: "invalid",
      diagnostics: errors.map((message) => ({
        from: 0,
        to: draftText.length,
        severity: "error" as const,
        message,
      })),
      ast: res.ast,
    };
  }
  return {
    status: "committed",
    filters,
    searchQuery,
    searchType: searchType ?? DEFAULT_SEARCH_TYPE,
    canonical: serialize(res.ast),
  };
}

// ---- Analytics: classify a rejected commit (LFE-10781 `filters:search_error`) ----

/** Why a non-empty typed query failed to become a valid applied filter. */
export type SearchErrorReason =
  | "unsupported_or"
  | "parse_error"
  | "unknown_field"
  | "bad_operator"
  | "unknown";

/**
 * True when the query uses an OR token BETWEEN conditions/sections — a top-level
 * `or` node (the unsupported, PARKED cross-field OR, LFE-10421). This is the
 * headline demand signal ("did the user try to OR two different conditions?").
 *
 * The supported within-a-single-field `field:(a OR b)` parses as ONE `filter`
 * node with `valueOp: "or"` — never an `or` node — so it is correctly NOT
 * flagged. An `or` node nested inside an AND/paren group or a NOT is still a
 * between-conditions OR, so we recurse through those; a `filter`'s within-field
 * OR lives in `valueOp`, so we never descend into it.
 */
export function queryUsesTopLevelOr(ast: ASTNode | null): boolean {
  if (ast === null) return false;
  switch (ast.kind) {
    case "or":
      return true;
    case "and":
      return ast.children.some(queryUsesTopLevelOr);
    case "not":
      return queryUsesTopLevelOr(ast.child);
    case "filter":
    case "text":
      return false;
  }
}

/**
 * Metadata-only classification of a rejected commit for `filters:search_error`.
 * `orAttempted` is structural (an `or` node in the AST); `reason` buckets by the
 * error cause the grammar/adapter distinguishes. NEVER reads raw values — only
 * the AST shape and diagnostic MESSAGES (which are static, value-free strings).
 */
export function classifySearchError(
  ast: ASTNode | null,
  diagnostics: Diagnostic[],
): { orAttempted: boolean; reason: SearchErrorReason } {
  const orAttempted = queryUsesTopLevelOr(ast);
  const errors = diagnostics.filter((d) => d.severity === "error");
  const has = (re: RegExp) => errors.some((d) => re.test(d.message));

  let reason: SearchErrorReason;
  if (errors.some((d) => d.message === OR_NOT_SUPPORTED_MESSAGE)) {
    reason = "unsupported_or";
  } else if (has(/^Unknown field\b/)) {
    reason = "unknown_field";
  } else if (
    has(
      /\bdoes not support\b|\bis not supported\b|\bare not supported\b|\bnot representable\b|\bonly applies\b|\bonly works\b|\bsupports a single\b|\bis an? (number|datetime|boolean|text|array) field\b|\bAND grouping\b|\ball-of groups\b/,
    )
  ) {
    reason = "bad_operator";
  } else if (
    ast === null ||
    has(
      /\bUnclosed\b|\bMissing (value|grouped)\b|\bMissing value\b|\bEmpty value\b|\bNested groups\b|\bIncomplete field\b/,
    )
  ) {
    reason = "parse_error";
  } else {
    reason = "unknown";
  }
  return { orAttempted, reason };
}
