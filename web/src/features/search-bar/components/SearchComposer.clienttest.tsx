import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { WORD_JOINER } from "@/src/features/search-bar/components/ComposerTokens";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

afterEach(cleanup);

function select(node: Node, start: number, end = start) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function text(editor: HTMLElement) {
  return (editor.textContent ?? "").split(WORD_JOINER).join("");
}

function setup(draft = "") {
  const store = createSearchBarStore();
  store.getState().actions.setDraft(draft);
  const commit = vi.fn(() => store.getState().draft);
  render(
    <SearchBarStoreProvider store={store} commit={commit}>
      <SearchComposer observed={undefined} />
    </SearchBarStoreProvider>,
  );
  const editor = screen.getByRole("combobox", { name: "Search" });
  act(() => editor.focus());
  return { editor, store, commit };
}

describe("SearchComposer IME composition", () => {
  it("projects a composition in an empty editor once and allows deleting it", () => {
    const { editor, store, commit } = setup();
    fireEvent.compositionStart(editor);
    // Native composition mutates contenteditable without a React-owned node.
    const composing = document.createTextNode("한");
    editor.appendChild(composing);
    select(composing, 1);
    fireEvent.input(editor, {
      inputType: "insertCompositionText",
      isComposing: true,
    });
    expect(store.getState().draft).toBe("");

    fireEvent.compositionEnd(editor, { data: "한" });
    expect(store.getState().draft).toBe("한");
    expect(text(editor)).toBe("한");

    fireEvent(
      editor,
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    expect(store.getState().draft).toBe("");
    expect(text(editor)).toBe("");
    fireEvent.blur(editor);
    expect(commit).toHaveLastReturnedWith("");
  });

  it("preserves filters when composing in the whitespace between tokens", () => {
    const initial = "level:ERROR name:foo";
    const { editor, store, commit } = setup(initial);
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let gap = walker.nextNode();
    while (gap !== null && gap.textContent !== " ") gap = walker.nextNode();
    expect(gap).not.toBeNull();
    fireEvent.compositionStart(editor);
    gap!.textContent = " 한 ";
    select(gap!, 2);
    fireEvent.compositionEnd(editor, { data: "한" });

    expect(store.getState().draft).toBe("level:ERROR 한 name:foo");
    expect(text(editor)).toBe("level:ERROR 한 name:foo");
    fireEvent(
      editor,
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    expect(text(editor)).toBe("level:ERROR  name:foo");
    fireEvent.blur(editor);
    expect(commit).toHaveLastReturnedWith("level:ERROR  name:foo");
  });

  it("preserves the caret when committing a DOM-only edit within a token", () => {
    const { editor, store, commit } = setup("name:foo");
    fireEvent.keyDown(editor, { key: "Escape" });
    const value = editor.querySelector('[data-part="value"]')!.firstChild!;
    value.textContent = "f한oo";
    select(value, 2);

    fireEvent.keyDown(editor, { key: "Enter" });
    expect(store.getState().draft).toBe("name:f한oo");
    expect(text(editor)).toBe("name:f한oo");
    expect(commit).toHaveLastReturnedWith("name:f한oo");
    const caret = window.getSelection()!.getRangeAt(0);
    const prefix = document.createRange();
    prefix.selectNodeContents(editor);
    prefix.setEnd(caret.endContainer, caret.endOffset);
    expect(prefix.toString().split(WORD_JOINER).join("")).toBe("name:f한");
  });

  it.each([
    ["한", ""],
    ["level:ERROR name:foo", "level:ERROR name:fo"],
  ])(
    "discards browser formatting when replacing all filters with %s",
    (replacement, deleted) => {
      const { editor, store } = setup("level:ERROR name:foo");
      fireEvent.compositionStart(editor);
      // Chromium preserves the selection's formatting in a new root element.
      const formatting = document.createElement("span");
      const composing = document.createTextNode(replacement);
      formatting.appendChild(composing);
      editor.replaceChildren(formatting);
      select(composing, replacement.length);
      fireEvent.compositionEnd(editor, { data: replacement });

      expect(store.getState().draft).toBe(replacement);
      expect(text(editor)).toBe(replacement);
      fireEvent(
        editor,
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        }),
      );
      expect(store.getState().draft).toBe(deleted);
      expect(text(editor)).toBe(deleted);
    },
  );
});
