import { describe, expect, it } from "vitest";

import { toLabelMap } from "./toLabelMap";

describe("toLabelMap", () => {
  it("prefers the name, then the detail, then the id", () => {
    expect(
      toLabelMap([
        { id: "a", name: "Alice", detail: "alice@example.com" },
        { id: "b", name: null, detail: "bob@example.com" },
        { id: "c", name: null, detail: null },
      ]),
    ).toEqual(
      new Map([
        ["a", "Alice"],
        ["b", "bob@example.com"],
        ["c", "c"],
      ]),
    );
  });

  it("keeps entries that share a label apart, since charts group by label", () => {
    expect(
      toLabelMap([
        { id: "k1", name: "ci", detail: "sk-gw-...1111" },
        { id: "k2", name: "ci", detail: "sk-gw-...2222" },
        { id: "k3", name: "prod", detail: "sk-gw-...3333" },
      ]),
    ).toEqual(
      new Map([
        ["k1", "ci (sk-gw-...1111)"],
        ["k2", "ci (sk-gw-...2222)"],
        ["k3", "prod"],
      ]),
    );
  });
});
