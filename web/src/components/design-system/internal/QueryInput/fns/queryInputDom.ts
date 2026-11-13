import { WORD_JOINER } from "../../../QueryTokens/QueryTokens.constants";

const WORD_JOINER_RE = new RegExp(WORD_JOINER, "g");
type LogicalRange = { start: number; end: number };
type Direction = "backward" | "forward";
type SourceRange = { from: number; to: number };
type SourceNode = SourceRange & {
  node: Node;
  source: string;
  atomic: boolean;
};
type SourceAtom = SourceRange & { element: Element };

function withoutJoiners(text: string): string {
  return text.replace(WORD_JOINER_RE, "");
}

function atomSource(node: Node): string | null {
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element).getAttribute("data-query-source")
    : null;
}

// Folded nodes carry their complete source; their visible label contributes
// no editable characters or caret positions to the query.
function sourceText(node: Node): string {
  const source = atomSource(node);
  if (source !== null) return source;
  if (node.nodeType === Node.TEXT_NODE)
    return withoutJoiners(node.textContent ?? "");
  return Array.from(node.childNodes, sourceText).join("");
}

function sourceNodes(root: HTMLElement): SourceNode[] {
  const nodes: SourceNode[] = [];
  let cursor = 0;
  const visit = (node: Node): void => {
    const atom = atomSource(node);
    if (atom !== null || node.nodeType === Node.TEXT_NODE) {
      const source = atom ?? withoutJoiners(node.textContent ?? "");
      nodes.push({
        node,
        source,
        atomic: atom !== null,
        from: cursor,
        to: cursor + source.length,
      });
      cursor += source.length;
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  return nodes;
}

export function textFromRoot(root: HTMLElement): string {
  return sourceText(root);
}

export function sourceAtomForNode(
  root: HTMLElement,
  node: Node,
): SourceAtom | null {
  if (!root.contains(node)) return null;
  const atom = sourceNodes(root).find(
    (part) => part.atomic && part.node.contains(node),
  );
  return atom === undefined
    ? null
    : { from: atom.from, to: atom.to, element: atom.node as Element };
}

export function sourceAtomAtOffset(
  root: HTMLElement,
  offset: number,
): SourceAtom | null {
  const atom = sourceNodes(root).find(
    (part) => part.atomic && part.from < offset && offset < part.to,
  );
  return atom === undefined
    ? null
    : { from: atom.from, to: atom.to, element: atom.node as Element };
}

function rawOffsetForLogicalOffset(
  text: string,
  logicalOffset: number,
): number {
  if (logicalOffset <= 0) return 0;
  let logical = 0;
  for (let raw = 0; raw < text.length; raw++) {
    if (text[raw] === WORD_JOINER) continue;
    logical++;
    if (logical === logicalOffset) return raw + 1;
  }
  return text.length;
}

export function logicalOffsetForDomPosition(
  root: HTMLElement,
  container: Node,
  offset: number,
  direction: Direction = "forward",
): number {
  if (!root.contains(container)) return textFromRoot(root).length;
  const locate = (node: Node, before: number): number => {
    const source = atomSource(node);
    if (source !== null) {
      const length = source.length;
      if (node === container && offset === 0) return before;
      if (node === container && offset >= node.childNodes.length)
        return before + length;
      return direction === "backward" ? before : before + length;
    }
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        return (
          before +
          withoutJoiners((node.textContent ?? "").slice(0, offset)).length
        );
      }
      return (
        before +
        Array.from(node.childNodes)
          .slice(0, offset)
          .reduce((length, child) => length + sourceText(child).length, 0)
      );
    }
    let cursor = before;
    for (const child of Array.from(node.childNodes)) {
      if (child === container || child.contains(container))
        return locate(child, cursor);
      cursor += sourceText(child).length;
    }
    return cursor;
  };
  return locate(root, 0);
}

export function selectionOffsets(root: HTMLElement): LogicalRange {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    const end = textFromRoot(root).length;
    return { start: end, end };
  }
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    const end = textFromRoot(root).length;
    return { start: end, end };
  }
  const start = logicalOffsetForDomPosition(
    root,
    range.startContainer,
    range.startOffset,
    range.collapsed ? "forward" : "backward",
  );
  return {
    start,
    end: range.collapsed
      ? start
      : logicalOffsetForDomPosition(
          root,
          range.endContainer,
          range.endOffset,
          "forward",
        ),
  };
}

function besideNode(
  node: Node,
  direction: Direction,
): { node: Node; offset: number } {
  const parent = node.parentNode;
  if (parent === null)
    return {
      node,
      offset: direction === "backward" ? 0 : node.childNodes.length,
    };
  let index = 0;
  let sibling = node.previousSibling;
  while (sibling !== null) {
    index++;
    sibling = sibling.previousSibling;
  }
  return { node: parent, offset: index + (direction === "forward" ? 1 : 0) };
}

export function domPositionForLogicalOffset(
  root: HTMLElement,
  offset: number,
  direction: Direction = "forward",
): { node: Node; offset: number } {
  const target = Math.max(0, offset);
  const nodes = sourceNodes(root);
  for (const part of nodes) {
    if (part.source.length === 0 || target > part.to) continue;
    if (part.atomic) {
      let edge = direction;
      if (target <= part.from) edge = "backward";
      else if (target >= part.to) edge = "forward";
      return besideNode(part.node, edge);
    }
    return {
      node: part.node,
      offset: rawOffsetForLogicalOffset(
        part.node.textContent ?? "",
        target - part.from,
      ),
    };
  }
  const last = nodes.at(-1);
  if (last !== undefined) {
    return last.atomic
      ? besideNode(last.node, "forward")
      : { node: last.node, offset: last.node.textContent?.length ?? 0 };
  }
  return { node: root, offset: root.childNodes.length };
}

export function setSelectionRange(
  root: HTMLElement,
  start: number,
  end: number,
): void {
  const length = textFromRoot(root).length;
  const from = Math.max(0, Math.min(start, end, length));
  const to = Math.max(0, Math.min(Math.max(start, end), length));
  const anchor = domPositionForLogicalOffset(
    root,
    from,
    from === to ? "forward" : "backward",
  );
  const focus =
    from === to ? anchor : domPositionForLogicalOffset(root, to, "forward");
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  range.setStart(anchor.node, anchor.offset);
  range.setEnd(focus.node, focus.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function snapOffsetAcrossAtoms(
  root: HTMLElement,
  offset: number,
  direction: Direction,
): number {
  const atom = sourceAtomAtOffset(root, offset);
  if (atom === null) return offset;
  return direction === "backward" ? atom.from : atom.to;
}

export function expandRangeAcrossAtoms(
  root: HTMLElement,
  range: SourceRange,
): SourceRange {
  let from = Math.min(range.from, range.to);
  let to = Math.max(range.from, range.to);
  if (from === to) {
    const offset = snapOffsetAcrossAtoms(root, from, "forward");
    return { from: offset, to: offset };
  }
  for (const part of sourceNodes(root)) {
    if (!part.atomic || part.to <= from || part.from >= to) continue;
    from = Math.min(from, part.from);
    to = Math.max(to, part.to);
  }
  return { from, to };
}
