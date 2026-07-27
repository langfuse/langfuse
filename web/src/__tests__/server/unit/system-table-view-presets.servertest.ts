/** @jest-environment node */

import { getSystemTableViewPresets } from "@langfuse/shared/src/server";
import {
  eventsTableCols,
  eventsTableFilterState,
  orderBy as orderBySchema,
  SystemTableViewPresetCategory,
  TableViewPresetTableName,
} from "@langfuse/shared";

// Column ids that are valid targets for a filter or an orderBy on the events
// table. Presets that reference an unknown column, or use a filter type/operator
// that does not match the column contract, would be silently dropped at apply
// time — so we assert the whole preset catalog is well-formed here.
const eventsColumnIds = new Set(eventsTableCols.map((col) => col.id));

describe("observations-events system table view presets", () => {
  const presets = getSystemTableViewPresets(
    TableViewPresetTableName.ObservationsEvents,
  );

  it("ships at least the categorized presets", () => {
    expect(presets.length).toBeGreaterThan(0);
    const categorized = presets.filter((preset) => preset.category);
    expect(categorized.length).toBeGreaterThan(0);
  });

  it.each(presets.map((preset) => [preset.name, preset] as const))(
    "preset %s has a valid filter state",
    (_name, preset) => {
      const parsed = eventsTableFilterState.safeParse(preset.state.filters);
      expect(parsed.success).toBe(true);

      for (const filter of preset.state.filters) {
        expect(eventsColumnIds).toContain(filter.column);
      }
    },
  );

  it.each(presets.map((preset) => [preset.name, preset] as const))(
    "preset %s has a valid orderBy referencing a known column",
    (_name, preset) => {
      const parsed = orderBySchema.safeParse(preset.state.orderBy);
      expect(parsed.success).toBe(true);

      if (preset.state.orderBy) {
        expect(eventsColumnIds).toContain(preset.state.orderBy.column);
      }
    },
  );

  it("only uses known categories", () => {
    const validCategories = new Set<string>(
      Object.values(SystemTableViewPresetCategory),
    );
    for (const preset of presets) {
      if (preset.category) {
        expect(validCategories).toContain(preset.category);
      }
    }
  });

  it("uses unique preset ids and names", () => {
    const ids = presets.map((preset) => preset.id);
    const names = presets.map((preset) => preset.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });
});
