import isEqual from "lodash/isEqual";
import {
  TableViewPresetTableName,
  getSystemTableViewPresets,
  type FilterState,
} from "@langfuse/shared";
import { filterStateToQueryText } from "../search-bar/lib/filter-state-to-query";
import { planCommit } from "../search-bar/lib/commit";

// Catalog guard for the LFE-14699 demote-on-user-edit no-op check
// (demoteViewOnUserFilterEdit): a user-origin filter write only demotes the
// active system preset when the filters actually CHANGED (lodash isEqual).
// That guard is only sound if every system preset's filters survive the
// search-bar grammar round-trip (filterStateToQueryText → planCommit →
// mergeWithSkipped) deep-equal — the bar re-commits the derived text on
// enter/blur, so a preset whose filters come back in a different shape would
// self-demote on a mere focus + blur with no edit.
//
// This holds for the whole catalog today but is catalog-fragile: e.g. an
// `id`/`name` stringOptions any-of-[single-value] re-commits as `string =`,
// and a `score_booleans` filter re-commits as `categoryOptions`. If a new
// preset fails here, give it a grammar-stable filter shape (or extend the
// grammar) — do not weaken the demote guard.

/** Mirrors filterIdentity + mergeWithSkipped in useEventsSearchBar: filters
 * the grammar can't represent are re-attached after a commit (no-silent-drop
 * contract), deduped by column+key against what the commit produced. */
const filterIdentity = (f: FilterState[number]): string =>
  `${f.column}\u0000${"key" in f ? f.key : ""}`;

const mergeWithSkipped = (
  produced: FilterState,
  skipped: FilterState,
): FilterState => {
  const producedKeys = new Set(produced.map(filterIdentity));
  const preserved = skipped.filter((f) => !producedKeys.has(filterIdentity(f)));
  return preserved.length > 0 ? [...produced, ...preserved] : produced;
};

const allPresets = Object.values(TableViewPresetTableName).flatMap(
  (tableName) => getSystemTableViewPresets(tableName),
);

describe("system preset filters round-trip the search-bar grammar (LFE-14699 demote guard)", () => {
  it("catalog is non-empty (guard cannot go vacuous)", () => {
    expect(allPresets.length).toBeGreaterThan(0);
  });

  for (const preset of allPresets) {
    it(`${preset.id} (${preset.name}) re-commits deep-equal`, () => {
      const { text, skippedFilters } = filterStateToQueryText(
        preset.state.filters,
      );

      // No ScoreTypeContext: no preset uses scores.* filters today. If one
      // does and fails to lower here, thread the score types through instead
      // of removing the preset from this guard.
      const commit = planCommit(text);
      expect(commit.status).toBe("committed");
      if (commit.status !== "committed") return;

      const merged = mergeWithSkipped(commit.filters, skippedFilters);
      expect(merged).toEqual(preset.state.filters);
      // Exactly the demote guard's comparison semantics.
      expect(isEqual(merged, preset.state.filters)).toBe(true);
    });
  }
});
