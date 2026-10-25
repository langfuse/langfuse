/**
 * Guard React's DOM mutations when Google Translate (or a similar in-page
 * translator) has already wrapped text nodes in `<font>` elements.
 *
 * Translate mutates the committed DOM. React then calls `removeChild` /
 * `insertBefore` on nodes whose parent is no longer the one React recorded,
 * and the browser throws `NotFoundError`. The usual workaround is to swallow
 * that specific `DOMException` so reconciliation can continue
 * (https://github.com/facebook/react/issues/11538).
 *
 * The `insertBefore` fallback must NOT call `this.appendChild`. The DOM spec
 * defines `appendChild(node)` as `insertBefore(node, null)`. Translators and
 * some engines implement it that way in JavaScript, so the fallback re-enters
 * the patched `insertBefore`, which throws again, and the two wrappers recurse
 * until `RangeError: Maximum call stack size exceeded`.
 */

type RemoveChild = (child: Node) => Node;
type InsertBefore = (node: Node, child: Node | null) => Node;

export type GoogleTranslateDomTarget = {
  removeChild: RemoveChild;
  insertBefore: InsertBefore;
};

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export function installGoogleTranslateDomGuards(
  target: GoogleTranslateDomTarget = Element.prototype,
): void {
  const originalRemoveChild = target.removeChild;
  const originalInsertBefore = target.insertBefore;

  target.removeChild = function (this: Node, child: Node): Node {
    try {
      return originalRemoveChild.call(this, child);
    } catch (error) {
      if (isNotFoundError(error)) {
        return child;
      }
      throw error;
    }
  };

  target.insertBefore = function (
    this: Node,
    node: Node,
    child: Node | null,
  ): Node {
    try {
      return originalInsertBefore.call(this, node, child);
    } catch (error) {
      if (isNotFoundError(error)) {
        return node;
      }
      throw error;
    }
  };
}

if (typeof window !== "undefined" && typeof Element !== "undefined") {
  installGoogleTranslateDomGuards();
}
