import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer";
import { WORD_JOINER } from "@/src/features/search-bar/components/ComposerTokens";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";

const WORD_JOINER_RE = new RegExp(WORD_JOINER, "g");

function renderComposer(draft = "") {
  const store = createSearchBarStore();
  if (draft.length > 0) store.getState().actions.setDraft(draft);
  const view = render(
    <SearchBarStoreProvider store={store} commit={vi.fn()}>
      <SearchComposer observed={undefined} />
    </SearchBarStoreProvider>,
  );
  return { store, ...view };
}

function composerRoot(): HTMLElement {
  return screen.getByTestId("search-bar-input");
}

function visibleComposerText(root: HTMLElement = composerRoot()): string {
  return (root.textContent ?? "").replace(WORD_JOINER_RE, "");
}

function hasDirectTextNode(root: HTMLElement): boolean {
  return Array.from(root.childNodes).some(
    (node) =>
      node.nodeType === Node.TEXT_NODE && (node.textContent ?? "") !== "",
  );
}

function lastSpaceTextNode(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let spaceNode: Text | null = null;
  let node = walker.nextNode();
  while (node !== null) {
    if ((node.textContent ?? "").includes(" ")) {
      spaceNode = node as Text;
    }
    node = walker.nextNode();
  }
  return spaceNode;
}

/**
 * Simulate an IME commit without a real IME: the browser writes a text node
 * React does not own, then fires compositionend. Korean/Chinese IMEs do this
 * in an empty contenteditable (and into whitespace text nodes between pills).
 */
function commitImeText(root: HTMLElement, text: string, target?: Text) {
  if (target !== undefined) {
    target.textContent = `${target.textContent ?? ""}${text}`;
  } else {
    root.appendChild(document.createTextNode(text));
  }
  fireEvent.compositionEnd(root);
}

describe("SearchComposer IME composition", () => {
  it("does not duplicate Korean text committed into an empty bar", () => {
    const { store } = renderComposer();
    const root = composerRoot();

    act(() => {
      commitImeText(root, "안녕");
    });

    expect(store.getState().draft).toBe("안녕");
    expect(visibleComposerText(root)).toBe("안녕");
    expect(hasDirectTextNode(root)).toBe(false);
  });

  it("lets Backspace delete the composed syllable after an IME commit", () => {
    const { store } = renderComposer();
    const root = composerRoot();

    act(() => {
      commitImeText(root, "안녕");
    });
    expect(store.getState().draft).toBe("안녕");

    act(() => {
      root.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        }),
      );
    });

    expect(store.getState().draft).toBe("안");
    expect(visibleComposerText(root)).toBe("안");
    expect(hasDirectTextNode(root)).toBe(false);
  });

  it("does not duplicate IME text written into the space between pills", () => {
    const { store } = renderComposer("level:ERROR ");
    const root = composerRoot();
    const spaceNode = lastSpaceTextNode(root);
    expect(spaceNode).not.toBeNull();

    act(() => {
      commitImeText(root, "안녕", spaceNode!);
    });

    expect(store.getState().draft).toBe("level:ERROR 안녕");
    expect(visibleComposerText(root)).toBe("level:ERROR 안녕");
    expect(hasDirectTextNode(root)).toBe(false);
  });
});
