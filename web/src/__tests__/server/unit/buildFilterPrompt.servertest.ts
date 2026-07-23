import { describe, expect, it } from "vitest";

import { FIELDS } from "@/src/features/search-bar/lib/fields";
import {
  buildFieldCatalog,
  buildFilterSystemPrompt,
  nullableFieldIds,
} from "@/src/features/search-bar/server/buildFilterPrompt";

describe("buildFieldCatalog / nullableFieldIds", () => {
  it("builds one catalog line per registered field", () => {
    const catalog = buildFieldCatalog();
    const lines = catalog.split("\n");
    expect(lines).toHaveLength(FIELDS.length);
    // Spot-check a well-known field renders its id and emitted type.
    expect(catalog).toContain("- level");
    expect(catalog).toMatch(/Emit as type "stringOptions"/);
  });

  it("lists exactly the nullable field ids, comma-joined", () => {
    const expected = FIELDS.filter((f) => f.nullable).map((f) => f.id);
    expect(nullableFieldIds()).toBe(expected.join(", "));
    // Sanity: there is at least one nullable field, and a non-nullable field
    // (e.g. "level") is not among them.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected).not.toContain("level");
  });

  it("embeds the SAME registry-derived catalog/nullable-ids text the managed-prompt compile path uses", () => {
    // This is the anti-drift invariant: the code fallback prompt and the
    // managed-prompt compile variables must be built from the identical
    // `buildFieldCatalog()` / `nullableFieldIds()` output, never a
    // re-derivation that could diverge from the grammar.
    const prompt = buildFilterSystemPrompt("Tuesday, 2026-07-21T12:00:00.000Z");
    expect(prompt).toContain(buildFieldCatalog());
    expect(prompt).toContain(`Nullable columns: ${nullableFieldIds()}.`);
  });

  it("anchors relative time expressions to the given current datetime", () => {
    const prompt = buildFilterSystemPrompt("Tuesday, 2026-07-21T12:00:00.000Z");
    expect(prompt).toContain(
      "The current datetime is: Tuesday, 2026-07-21T12:00:00.000Z",
    );
  });
});
