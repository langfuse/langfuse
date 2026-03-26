import { shouldIgnoreRowClickTarget } from "@/src/components/table/data-table";

describe("shouldIgnoreRowClickTarget", () => {
  it("returns true for button descendants", () => {
    const button = document.createElement("button");
    const icon = document.createElement("span");
    button.appendChild(icon);

    expect(shouldIgnoreRowClickTarget(icon)).toBe(true);
  });

  it("returns true for link descendants", () => {
    const link = document.createElement("a");
    const child = document.createElement("div");
    link.appendChild(child);

    expect(shouldIgnoreRowClickTarget(child)).toBe(true);
  });

  it("returns false for non-interactive elements", () => {
    const div = document.createElement("div");

    expect(shouldIgnoreRowClickTarget(div)).toBe(false);
  });
});
