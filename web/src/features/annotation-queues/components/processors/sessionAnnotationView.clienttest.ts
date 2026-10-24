import { describe, expect, it } from "vitest";
import { SESSION_DETAIL_SYSTEM_PRESETS } from "@/src/features/sessions/session-detail-presets";
import {
  getSessionAnnotationViewStorageKey,
  resolveSessionAnnotationView,
} from "./sessionAnnotationView";

describe("resolveSessionAnnotationView", () => {
  it("defaults to empty filters and no label", () => {
    expect(
      resolveSessionAnnotationView({ selectedViewId: null, savedViews: [] }),
    ).toEqual({
      filterState: [],
      viewLabel: null,
      selectedSystemPreset: null,
      selectedSavedView: null,
    });
  });

  it("resolves a system preset to its filters and name", () => {
    const preset = SESSION_DETAIL_SYSTEM_PRESETS[0];
    const resolved = resolveSessionAnnotationView({
      selectedViewId: preset.id,
      savedViews: [],
    });
    expect(resolved.filterState).toEqual(preset.filters);
    expect(resolved.viewLabel).toEqual(preset.name);
    expect(resolved.selectedSystemPreset?.id).toEqual(preset.id);
  });

  it("resolves a saved view to its filters and name", () => {
    const resolved = resolveSessionAnnotationView({
      selectedViewId: "saved-1",
      savedViews: [
        {
          id: "saved-1",
          name: "Roots only",
          filters: [
            { column: "hasInput", type: "boolean", operator: "=", value: true },
          ],
        },
      ],
    });
    expect(resolved.viewLabel).toEqual("Roots only");
    expect(resolved.filterState).toEqual([
      { column: "hasInput", type: "boolean", operator: "=", value: true },
    ]);
  });

  it("falls back to default for unknown ids (e.g. deleted saved view)", () => {
    const resolved = resolveSessionAnnotationView({
      selectedViewId: "missing",
      savedViews: [],
    });
    expect(resolved.filterState).toEqual([]);
    expect(resolved.viewLabel).toBeNull();
  });
});

describe("getSessionAnnotationViewStorageKey", () => {
  it("scopes the persisted view per queue", () => {
    expect(getSessionAnnotationViewStorageKey("q1")).toContain("q1");
    expect(getSessionAnnotationViewStorageKey("q1")).not.toEqual(
      getSessionAnnotationViewStorageKey("q2"),
    );
  });
});
