import { describe, expect, it } from "vitest";

import { toKeyOwnerLabelMap } from "./toKeyOwnerLabelMap";

const alice = { id: "u1", name: "Alice", detail: "alice@example.com" };
const otherAlice = { id: "u2", name: "Alice", detail: "alice@other.com" };

describe("toKeyOwnerLabelMap", () => {
  it("labels user-tied keys by their owner and service keys by themselves", () => {
    expect(
      toKeyOwnerLabelMap([
        { id: "k1", name: "laptop", detail: "sk-...1", owner: alice },
        { id: "k2", name: "ci", detail: "sk-...2", owner: alice },
        { id: "k3", name: "batch job", detail: "sk-...3", owner: null },
      ]),
    ).toEqual(
      new Map([
        ["k1", "Alice"],
        ["k2", "Alice"],
        ["k3", "batch job"],
      ]),
    );
  });

  it("keeps different owners and service keys with one name apart", () => {
    expect(
      toKeyOwnerLabelMap([
        { id: "k1", name: null, detail: "sk-...1", owner: alice },
        { id: "k2", name: null, detail: "sk-...2", owner: otherAlice },
        { id: "k3", name: "Alice", detail: "sk-...3", owner: null },
      ]),
    ).toEqual(
      new Map([
        ["k1", "Alice (alice@example.com)"],
        ["k2", "Alice (alice@other.com)"],
        ["k3", "Alice (sk-...3)"],
      ]),
    );
  });
});
