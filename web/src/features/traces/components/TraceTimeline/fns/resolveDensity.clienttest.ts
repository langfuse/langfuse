import { describe, expect, it } from "vitest";
import { resolveDensity } from "./resolveDensity";

describe("resolveDensity", () => {
  it("resolves from the pointer modality and lines per row", () => {
    // Never a function of box height: a short trace in a tall box keeps
    // Finder-row density rather than growing into the slack.
    expect(resolveDensity({ pointer: "fine" }).rowHeight).toBe(26);
    expect(resolveDensity({ pointer: "coarse" }).rowHeight).toBe(44);
    // A stacked row (name above bar) needs two text lines' worth.
    expect(resolveDensity({ pointer: "fine", lines: 2 }).rowHeight).toBe(38);
    expect(resolveDensity({ pointer: "coarse", lines: 2 }).rowHeight).toBe(44);
  });
});
