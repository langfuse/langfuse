import { afterEach, describe, expect, it } from "vitest";
import { WORD_JOINER } from "../../../QueryTokens/QueryTokens.constants";
import {
  domPositionForLogicalOffset,
  expandRangeAcrossAtoms,
  logicalOffsetForDomPosition,
  selectionOffsets,
  setSelectionRange,
  snapOffsetAcrossAtoms,
  sourceAtomAtOffset,
  sourceAtomForNode,
  textFromRoot,
} from "./queryInputDom";

const source = "userId:(alice OR bob OR carol)";

function createEditor() {
  const root = document.createElement("div");
  root.contentEditable = "true";
  const prefix = document.createElement("span");
  prefix.textContent = `env:prod${WORD_JOINER} `;
  const atom = document.createElement("span");
  atom.setAttribute("data-query-source", source);
  atom.contentEditable = "false";
  const label = document.createElement("span");
  label.textContent = "userId:[alice +2]";
  atom.appendChild(label);
  const suffix = document.createElement("span");
  suffix.textContent = ` level:ERROR${WORD_JOINER}`;
  root.append(prefix, atom, suffix);
  document.body.appendChild(root);
  return {
    root,
    atom,
    prefix,
    label,
    suffix,
    from: "env:prod ".length,
    to: "env:prod ".length + source.length,
    text: `env:prod ${source} level:ERROR`,
  };
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("query input source mapping", () => {
  it("keeps a nested value atom separate from editable negation, key, and target text", () => {
    const root = document.createElement("div");
    root.contentEditable = "true";
    const condition = document.createElement("span");
    const prefix = '-metadata."kind:variant":';
    const values = '("a" OR "b" OR "c")';
    const suffix = ' @"Run A"';
    const key = document.createTextNode(prefix);
    const atom = document.createElement("span");
    atom.contentEditable = "false";
    atom.setAttribute("data-query-source", values);
    const button = document.createElement("button");
    button.textContent = "a +2";
    atom.appendChild(button);
    const target = document.createTextNode(suffix);
    condition.append(key, atom, target);
    root.appendChild(condition);
    document.body.appendChild(root);
    const from = prefix.length;
    const to = from + values.length;
    expect(textFromRoot(root)).toBe(prefix + values + suffix);
    expect(sourceAtomForNode(root, button)).toEqual({
      from,
      to,
      element: atom,
    });
    expect(sourceAtomForNode(root, key)).toBeNull();
    expect(sourceAtomAtOffset(root, from - 1)).toBeNull();
    expect(sourceAtomAtOffset(root, from + 1)).toEqual({
      from,
      to,
      element: atom,
    });
    expect(expandRangeAcrossAtoms(root, { from: 1, to: from - 1 })).toEqual({
      from: 1,
      to: from - 1,
    });
    expect(expandRangeAcrossAtoms(root, { from: to - 1, to: to + 1 })).toEqual({
      from,
      to: to + 1,
    });
    setSelectionRange(root, 1, from - 1);
    expect(selectionOffsets(root)).toEqual({ start: 1, end: from - 1 });
    setSelectionRange(root, to + 2, to + 2);
    expect(selectionOffsets(root)).toEqual({ start: to + 2, end: to + 2 });
    expect(domPositionForLogicalOffset(root, to + 2)).toEqual({
      node: target,
      offset: 2,
    });
  });

  it("keeps folded source intact through DOM reads and selection-based clipboard edits", () => {
    const { root, atom, from, to, text, suffix } = createEditor();
    expect(textFromRoot(root)).toBe(text);
    expect(logicalOffsetForDomPosition(root, root, 1)).toBe(from);
    expect(logicalOffsetForDomPosition(root, root, 2)).toBe(to);
    expect(logicalOffsetForDomPosition(root, suffix.firstChild!, 6)).toBe(
      to + 6,
    );

    const range = document.createRange();
    range.selectNode(atom);
    window.getSelection()!.addRange(range);
    const selected = selectionOffsets(root);
    expect(selected).toEqual({ start: from, end: to });
    expect(text.slice(selected.start, selected.end)).toBe(source);
    expect(
      text.slice(0, selected.start) + "userId:=dave" + text.slice(selected.end),
    ).toBe("env:prod userId:=dave level:ERROR");

    setSelectionRange(root, to + 6, to + 6);
    expect(selectionOffsets(root)).toEqual({ start: to + 6, end: to + 6 });
  });

  it("crosses folded atoms as a unit for arrows and deletion without entering their label", () => {
    const { root, atom, from, to } = createEditor();
    expect(snapOffsetAcrossAtoms(root, to - 1, "backward")).toBe(from);
    expect(snapOffsetAcrossAtoms(root, from + 1, "forward")).toBe(to);
    expect(expandRangeAcrossAtoms(root, { from: to - 1, to })).toEqual({
      from,
      to,
    });
    expect(expandRangeAcrossAtoms(root, { from, to: from + 1 })).toEqual({
      from,
      to,
    });
    expect(expandRangeAcrossAtoms(root, { from: from - 1, to: from })).toEqual({
      from: from - 1,
      to: from,
    });

    const before = domPositionForLogicalOffset(root, from + 1, "backward");
    const after = domPositionForLogicalOffset(root, from + 1, "forward");
    expect(atom.contains(before.node)).toBe(false);
    expect(atom.contains(after.node)).toBe(false);
    expect(logicalOffsetForDomPosition(root, before.node, before.offset)).toBe(
      from,
    );
    expect(logicalOffsetForDomPosition(root, after.node, after.offset)).toBe(
      to,
    );

    setSelectionRange(root, from + 1, to - 1);
    expect(selectionOffsets(root)).toEqual({ start: from, end: to });
  });

  it("normalizes partial native atom selections while preserving ordinary Unicode text", () => {
    const { root, label, from, to, prefix } = createEditor();
    const range = document.createRange();
    range.setStart(label.firstChild!, 3);
    range.setEnd(label.firstChild!, 7);
    window.getSelection()!.addRange(range);
    expect(selectionOffsets(root)).toEqual({ start: from, end: to });

    prefix.textContent = `😀 env:prod${WORD_JOINER} `;
    expect(logicalOffsetForDomPosition(root, prefix.firstChild!, 2)).toBe(2);
    const position = domPositionForLogicalOffset(root, 2);
    expect(position).toEqual({ node: prefix.firstChild, offset: 2 });
    setSelectionRange(
      root,
      textFromRoot(root).length,
      textFromRoot(root).length,
    );
    const end = textFromRoot(root).length;
    expect(selectionOffsets(root)).toEqual({ start: end, end });
  });
});
