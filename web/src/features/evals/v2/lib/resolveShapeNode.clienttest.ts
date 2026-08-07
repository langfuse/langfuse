import { describe, expect, it } from "vitest";

import { resolveShapeNode } from "./resolveShapeNode";

describe("resolveShapeNode", () => {
  it("walks own object properties and array indexes", () => {
    expect(
      resolveShapeNode({ items: [{ value: 42 }] }, ["items", 0, "value"]),
    ).toEqual({
      found: true,
      value: 42,
    });
  });

  it("does not traverse inherited properties", () => {
    const root = Object.create({ secret: "inherited" }) as Record<
      string,
      unknown
    >;

    expect(resolveShapeNode(root, ["secret"])).toEqual({
      found: false,
      value: undefined,
    });
  });
});
