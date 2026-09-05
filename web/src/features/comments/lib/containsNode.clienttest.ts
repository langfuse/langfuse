// @vitest-environment jsdom

import { containsNode } from "./containsNode";

describe("containsNode", () => {
  it("returns true when the container contains the node", () => {
    const container = document.createElement("div");
    const child = document.createTextNode("hello");
    container.appendChild(child);

    expect(containsNode(container, child)).toBe(true);
  });

  it("returns false when the node is outside the container", () => {
    const container = document.createElement("div");
    const outsider = document.createTextNode("elsewhere");

    expect(containsNode(container, outsider)).toBe(false);
  });

  it("returns false for a missing container or a non-Node", () => {
    const container = document.createElement("div");

    expect(containsNode(null, container)).toBe(false);
    expect(containsNode(undefined, container)).toBe(false);
    expect(containsNode(container, null)).toBe(false);
    expect(containsNode(container, undefined)).toBe(false);
    expect(containsNode(container, {})).toBe(false);
    expect(containsNode(container, window)).toBe(false);
  });

  it("returns false when contains throws the Firefox TypeError", () => {
    const container = document.createElement("div");
    const child = document.createTextNode("hello");
    container.appendChild(child);

    const contains = vi.spyOn(container, "contains").mockImplementation(() => {
      throw new TypeError(
        "Node.contains: Argument 1 does not implement interface Node.",
      );
    });

    expect(containsNode(container, child)).toBe(false);
    expect(contains).toHaveBeenCalledOnce();
  });
});
