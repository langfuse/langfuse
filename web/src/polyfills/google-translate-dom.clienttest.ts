import { describe, expect, it } from "vitest";

import {
  installGoogleTranslateDomGuards,
  type GoogleTranslateDomTarget,
} from "@/src/polyfills/google-translate-dom";

function notFound(): never {
  throw new DOMException("The object can not be found here.", "NotFoundError");
}

describe("installGoogleTranslateDomGuards", () => {
  it("swallows removeChild NotFoundError and returns the child", () => {
    const child = document.createElement("span");
    const target: GoogleTranslateDomTarget = {
      removeChild: () => notFound(),
      insertBefore: () => notFound(),
    };

    installGoogleTranslateDomGuards(target);

    expect(target.removeChild(child)).toBe(child);
  });

  it("swallows insertBefore NotFoundError without calling appendChild", () => {
    const node = document.createElement("span");
    const reference = document.createElement("i");
    let appendChildCalls = 0;

    const target: GoogleTranslateDomTarget & {
      appendChild: (child: Node) => Node;
    } = {
      removeChild: () => notFound(),
      insertBefore: () => notFound(),
      appendChild(child: Node) {
        appendChildCalls += 1;
        return this.insertBefore(child, null);
      },
    };

    installGoogleTranslateDomGuards(target);

    expect(target.insertBefore(node, reference)).toBe(node);
    expect(appendChildCalls).toBe(0);
  });

  it("does not recurse when appendChild is implemented as insertBefore", () => {
    const node = document.createElement("span");
    let insertCalls = 0;

    const target: GoogleTranslateDomTarget & {
      appendChild: (child: Node) => Node;
    } = {
      removeChild: () => notFound(),
      insertBefore() {
        insertCalls += 1;
        if (insertCalls > 20) {
          throw new RangeError("Maximum call stack size exceeded");
        }
        notFound();
      },
      appendChild(child: Node) {
        return this.insertBefore(child, null);
      },
    };

    installGoogleTranslateDomGuards(target);

    expect(() =>
      target.insertBefore(node, document.createElement("i")),
    ).not.toThrow();
    expect(insertCalls).toBe(1);
  });

  it("rethrows errors that are not NotFoundError", () => {
    const target: GoogleTranslateDomTarget = {
      removeChild: () => {
        throw new DOMException(
          "Hierarchy request error",
          "HierarchyRequestError",
        );
      },
      insertBefore: () => {
        throw new TypeError("Node.insertBefore: Argument 1 is not an object.");
      },
    };

    installGoogleTranslateDomGuards(target);

    expect(() => target.removeChild(document.createElement("span"))).toThrow(
      /Hierarchy request error/,
    );
    expect(() =>
      target.insertBefore(document.createElement("span"), null),
    ).toThrow(/Argument 1 is not an object/);
  });

  it("leaves successful mutations on a real element intact", () => {
    const originalRemoveChild = Element.prototype.removeChild;
    const originalInsertBefore = Element.prototype.insertBefore;

    try {
      installGoogleTranslateDomGuards();

      const parent = document.createElement("div");
      const first = document.createElement("span");
      const second = document.createElement("em");
      parent.appendChild(first);

      expect(parent.insertBefore(second, first)).toBe(second);
      expect(parent.firstChild).toBe(second);
      expect(parent.removeChild(first)).toBe(first);
      expect(parent.contains(first)).toBe(false);
    } finally {
      Element.prototype.removeChild = originalRemoveChild;
      Element.prototype.insertBefore = originalInsertBefore;
    }
  });
});
