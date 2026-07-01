import { afterEach, describe, expect, it } from "vitest";

import { shouldKeepPeekOpenOnOutsideInteraction } from "@/src/components/table/peek";

// Build a detached element tree and return the deepest child as the event target.
function targetWith(
  attrs: Record<string, string>,
  wrap?: Record<string, string>,
) {
  const el = document.createElement("span");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (wrap) {
    const parent = document.createElement("div");
    for (const [k, v] of Object.entries(wrap)) parent.setAttribute(k, v);
    parent.appendChild(el);
    document.body.appendChild(parent);
  } else {
    document.body.appendChild(el);
  }
  return el;
}

const IGNORED = ['[role="checkbox"]', "[data-bookmark-toggle]"];

describe("shouldKeepPeekOpenOnOutsideInteraction", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("closes (returns false) for a plain outside target", () => {
    expect(
      shouldKeepPeekOpenOnOutsideInteraction(targetWith({}), IGNORED),
    ).toBe(false);
  });

  it("keeps open for any target inside the peek content", () => {
    const target = targetWith({}, { "data-peek-content": "" });
    expect(shouldKeepPeekOpenOnOutsideInteraction(target, IGNORED)).toBe(true);
  });

  it("keeps open when clicking another table row (switch, not close)", () => {
    const target = targetWith({}, { "data-row-index": "3" });
    expect(shouldKeepPeekOpenOnOutsideInteraction(target, IGNORED)).toBe(true);
  });

  it("keeps open for an opt-out region", () => {
    const target = targetWith({}, { "data-ignore-outside-interaction": "" });
    expect(shouldKeepPeekOpenOnOutsideInteraction(target, IGNORED)).toBe(true);
  });

  it("keeps open for a selection checkbox even outside any row", () => {
    expect(
      shouldKeepPeekOpenOnOutsideInteraction(
        targetWith({ role: "checkbox" }),
        IGNORED,
      ),
    ).toBe(true);
  });

  it("keeps open for a table-configured ignoredSelector", () => {
    expect(
      shouldKeepPeekOpenOnOutsideInteraction(
        targetWith({ "data-bookmark-toggle": "true" }),
        IGNORED,
      ),
    ).toBe(true);
  });

  it("closes for non-Element targets", () => {
    expect(shouldKeepPeekOpenOnOutsideInteraction(null, IGNORED)).toBe(false);
    expect(
      shouldKeepPeekOpenOnOutsideInteraction(new EventTarget(), IGNORED),
    ).toBe(false);
  });
});
