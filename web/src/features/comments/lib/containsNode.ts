/**
 * Firefox's Node.contains() throws TypeError when the argument is not a
 * Node from this document — native anonymous content around inputs,
 * textareas, and media, or a cross-document range. Chrome returns false.
 */
export function containsNode(
  container: Node | null | undefined,
  node: EventTarget | Node | null | undefined,
): boolean {
  if (!container || !(node instanceof Node)) {
    return false;
  }
  try {
    return container.contains(node);
  } catch {
    return false;
  }
}
