// Reusable property-test harness for the search bar — the universal safety net
// described in README.md ("Round-trip property test", "Extending to other
// views"). It is PURE (no vitest import, no global state) so it is safe in the
// build and so any *.clienttest.ts can drive it. A view wires its registry in
// once; the harness generates the field × operator × value matrix from that
// registry and checks three invariants that have each regressed in this PR's
// history:
//
//   INV-1  commit-gate parity — validateQuery(text).valid === true MUST imply
//          the commit-time lowering (astToFilterState) produces no errors.
//          (Regressed in 6e84fe4 / 32215fb: validate clean while lower errored
//          → an empty filter set committed silently.)
//   INV-2  no silent drop/rewrite — FilterState → text → FilterState is stable:
//          every filter round-trips unchanged or is reported in skippedFilters,
//          and nothing is rewritten into a different filter.
//   INV-3  serialize ↔ parse symmetry — a free-text value always re-parses to
//          itself and stays valid. (Regressed in #4: serializeValue emitted a
//          bare reserved token — `or`, `!important` — that the parser rejects.)
//
// "Repeats itself per view": when a second filterable view adopts the bar, call
// runSearchBarInvariants({ name, fields, extraKeys, ... }) with that view's
// registry. The generators read `view.fields`, so they cover new/changed fields
// automatically. Today parse/validate/lower close over the single global FIELDS
// registry; when the grammar is parameterized over an injected registry (the
// seam in README "Extending to other views"), thread `view.registry` into the
// parse/validate/lower calls below — the generators and assertions do not
// change.

import type { FieldDef } from "./fields";
import type { ScoreTypeContext } from "./adapter";
import type { FilterState } from "@langfuse/shared";
import { parse, serialize } from "./langQ";
import { astToFilterState } from "./adapter";
import { validateQuery } from "./validate";
import { filterStateToQueryText } from "./filter-state-to-query";

/** A filterable view's grammar surface under test. */
export type RegistryUnderTest = {
  /** Label for failure messages (e.g. "events v4"). */
  name: string;
  /** The field registry the grammar resolves against. */
  fields: FieldDef[];
  /**
   * Grammar-overlay keys that are not plain fields: dot-path examples
   * (`metadata.region`, `scores.accuracy`, `traceScores.nps`) and pseudo-fields
   * (`has:endTime`, `in:content`). These exercise resolveField branches the
   * field list alone does not reach.
   */
  extraKeys: string[];
  /** Score-type contexts to vary (routes scores.<name> numeric vs categorical). */
  scoreContexts: ScoreTypeContext[];
  /** Values tried as filter values across fields/operators. */
  fieldValues: string[];
  /**
   * Free-text values for INV-3. Include adversarial tokens the parser reserves
   * or quotes (boolean keywords any case, `!`-prefix, whitespace, commas,
   * leading operators, quotes) — these are what break serialize↔parse.
   */
  freeTextValues: string[];
};

export type InvariantFailure = {
  invariant: string;
  case: string;
  detail: string;
};

// Prefix operators a value can carry after the colon, plus positional `*` glob
// wraps (starts/ends/contains). INV-1 does not need to know which are valid for
// a given field — it only checks the two gates agree — so we throw the whole
// set at every field. `%s` is replaced by the value.
const OP_PREFIXES = ["", "=", ">", "<", ">=", "<="] as const;
const GLOB_FORMS = ["%s*", "*%s", "*%s*"] as const;
const GROUP_VALUES = ["(a OR b)", "(a AND b)", "(a)"] as const;

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/** Multiset equality of two filter lists, order-independent. */
function sameFilters(a: FilterState, b: FilterState): boolean {
  if (a.length !== b.length) return false;
  const sortedA = a.map(stable).sort();
  const sortedB = b.map(stable).sort();
  return sortedA.every((s, i) => s === sortedB[i]);
}

/** Every query string the matrix generates for a view. */
export function generateQueryCases(view: RegistryUnderTest): string[] {
  const keys = [...view.fields.map((f) => f.id), ...view.extraKeys];
  const cases: string[] = [];
  for (const key of keys) {
    // `has:`/`in:` already carry their own value in extraKeys.
    if (key.includes(":")) {
      cases.push(key, `-${key}`);
      continue;
    }
    for (const neg of ["", "-"]) {
      for (const value of view.fieldValues) {
        for (const op of OP_PREFIXES) {
          cases.push(`${neg}${key}:${op}${value}`);
        }
        for (const glob of GLOB_FORMS) {
          cases.push(`${neg}${key}:${glob.replace("%s", value)}`);
        }
      }
      for (const group of GROUP_VALUES) {
        cases.push(`${neg}${key}:${group}`);
      }
    }
  }
  return cases;
}

/** INV-1: a query the commit gate accepts must lower without errors. */
function checkParity(
  text: string,
  ctx: ScoreTypeContext | undefined,
): InvariantFailure | null {
  if (!validateQuery(text, ctx).valid) return null; // gate rejects → no claim
  const errors = astToFilterState(parse(text).ast, ctx).errors;
  if (errors.length === 0) return null;
  return {
    invariant: "INV-1 commit-gate parity",
    case: text,
    detail: `validateQuery accepted but lowering errored: ${errors.join("; ")}`,
  };
}

/** INV-2: FilterState → text → FilterState is stable (no drop, no rewrite). */
function checkFilterStateRoundTrip(
  text: string,
  ctx: ScoreTypeContext | undefined,
): InvariantFailure | null {
  if (!validateQuery(text, ctx).valid) return null;
  const first = astToFilterState(parse(text).ast, ctx);
  if (first.errors.length > 0 || first.filters.length === 0) return null;
  const fs1 = first.filters;
  const forward = filterStateToQueryText(fs1);
  const fs2 = astToFilterState(parse(forward.text).ast, ctx).filters;
  // Filters with no grammar form are preserved via skippedFilters, not text.
  const expected = fs1.filter(
    (f) => !forward.skippedFilters.some((s) => stable(s) === stable(f)),
  );
  if (sameFilters(fs2, expected)) return null;
  return {
    invariant: "INV-2 FilterState round-trip",
    case: text,
    detail: `expected ${stable(expected)} (+skipped ${stable(
      forward.skippedFilters,
    )}) but re-lowered "${forward.text}" to ${stable(fs2)}`,
  };
}

/** INV-3: a free-text value re-parses to itself and stays valid. */
function checkSerializeSymmetry(value: string): InvariantFailure | null {
  const text = serialize({ kind: "text", value });
  const res = parse(text);
  const ast = res.ast;
  const ok = res.valid && ast?.kind === "text" && ast.value === value;
  if (ok) return null;
  return {
    invariant: "INV-3 serialize↔parse symmetry",
    case: JSON.stringify(value),
    detail: `serialize→"${text}" reparsed valid=${res.valid}, value=${
      ast?.kind === "text" ? JSON.stringify(ast.value) : `<${ast?.kind}>`
    }`,
  };
}

/**
 * Run all three invariants over a view's registry and return every failure.
 * The caller (a *.clienttest.ts) asserts the list is empty.
 */
export function runSearchBarInvariants(
  view: RegistryUnderTest,
): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  const contexts: (ScoreTypeContext | undefined)[] =
    view.scoreContexts.length > 0 ? view.scoreContexts : [undefined];

  for (const text of generateQueryCases(view)) {
    for (const ctx of contexts) {
      const parity = checkParity(text, ctx);
      if (parity) failures.push(parity);
      const roundTrip = checkFilterStateRoundTrip(text, ctx);
      if (roundTrip) failures.push(roundTrip);
    }
  }
  for (const value of view.freeTextValues) {
    const symmetry = checkSerializeSymmetry(value);
    if (symmetry) failures.push(symmetry);
  }
  return failures;
}
