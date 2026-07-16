import { describe, expect, it } from "vitest";

import {
  buildExplodedBreakdownNotice,
  getExplodedDimensionFields,
} from "./exploded-breakdown";

describe("getExplodedDimensionFields", () => {
  it("returns only fields the data model explodes per element", () => {
    expect(
      getExplodedDimensionFields("traces", "v1", ["tags", "name", "userId"]),
    ).toEqual(["tags"]);
  });

  it("detects exploded fields on the v2 events views", () => {
    expect(getExplodedDimensionFields("traces", "v2", ["tags"])).toEqual([
      "tags",
    ]);
  });

  it("returns empty for scalar-only breakdowns and unknown fields", () => {
    expect(
      getExplodedDimensionFields("traces", "v1", ["name", "doesNotExist"]),
    ).toEqual([]);
    expect(getExplodedDimensionFields("traces", "v1", [])).toEqual([]);
  });
});

describe("buildExplodedBreakdownNotice", () => {
  it("is undefined without exploded fields", () => {
    expect(buildExplodedBreakdownNotice("traces", [])).toBeUndefined();
  });

  it("names the entity and the exploded dimension", () => {
    const notice = buildExplodedBreakdownNotice("traces", ["tags"]);
    expect(notice).toContain("A trace with multiple tags");
    expect(notice).toContain("counted once in each matching bucket");
  });

  it("uses the right article for vowel-initial entities", () => {
    expect(buildExplodedBreakdownNotice("observations", ["tags"])).toContain(
      "An observation with multiple tags",
    );
  });
});
