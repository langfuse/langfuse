import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../../.storybook/preview";
import { SearchComposer } from "./SearchComposer";
import { WORD_JOINER } from "@/src/components/design-system/QueryTokens/QueryTokens.constants";
import { SearchBarStoreProvider } from "../../store/SearchBarStoreProvider";
import { createSearchBarStore } from "../../store/searchBarStore";

function ComposerHost({
  initialDraft,
  ...props
}: ComponentProps<typeof SearchComposer> & { initialDraft: string }) {
  const [store] = useState(() => {
    const created = createSearchBarStore();
    created.getState().actions.setDraft(initialDraft);
    return created;
  });
  return (
    <SearchBarStoreProvider store={store} commit={fn()}>
      <SearchComposer {...props} />
    </SearchBarStoreProvider>
  );
}

const meta = preview.meta({
  component: ComposerHost,
  args: { initialDraft: "", observed: undefined },
});

export const TestQueryTextPreservation = meta.story({
  name: "(Test) Quoted fields and whitespace preserve query text",
  args: {
    initialDraft: 'metadata."foo:bar":*x* scores."Rouge Score":>=1 hello',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const root = canvas.getByRole("combobox");
    const filters = canvas
      .getAllByTestId("search-bar-token")
      .filter((token) => token.dataset.kind === "filter");
    await expect(filters).toHaveLength(2);
    // A colon inside the quoted key must not become the field/value separator.
    await expect((root.textContent ?? "").split(WORD_JOINER).join("")).toBe(
      args.initialDraft,
    );
    // IME recovery needs React to own whitespace as well as token text.
    for (const child of Array.from(root.childNodes)) {
      await expect(child.nodeType).toBe(Node.ELEMENT_NODE);
    }
  },
});

// Real IMEs can write DOM nodes React does not own before compositionend.
function commitImeText(root: HTMLElement, text: string, target?: Text) {
  if (target !== undefined) {
    target.textContent = `${target.textContent ?? ""}${text}`;
  } else {
    root.appendChild(document.createTextNode(text));
  }
  // A real IME leaves the caret after its committed run; DOM mutation alone does not.
  const range = document.createRange();
  range.selectNodeContents(target ?? root);
  range.collapse(false);
  const selection = window.getSelection();
  if (selection === null) throw new Error("Expected browser selection");
  selection.removeAllRanges();
  selection.addRange(range);
  root.dispatchEvent(
    new CompositionEvent("compositionend", { bubbles: true, data: text }),
  );
}

async function expectComposedText(root: HTMLElement, text: string) {
  await waitFor(() => {
    expect((root.textContent ?? "").split(WORD_JOINER).join("")).toBe(text);
    // Unmanaged text would survive the next token projection and duplicate the IME run.
    expect(
      Array.from(root.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent !== "",
      ),
    ).toBe(false);
  });
}

export const TestBackspaceAfterImeCommit = meta.story({
  name: "(Test) IME commit avoids duplication and supports backspace",
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByRole("combobox", {
      name: "Search",
    });
    await userEvent.click(root);
    commitImeText(root, "안녕");
    await expectComposedText(root, "안녕");
    root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "deleteContentBackward",
      }),
    );
    await expectComposedText(root, "안");
  },
});

export const TestImeCommitBetweenTokens = meta.story({
  name: "(Test) IME commit in whitespace does not duplicate text",
  args: { initialDraft: "level:ERROR " },
  play: async ({ canvasElement }) => {
    const root = within(canvasElement).getByRole("combobox", {
      name: "Search",
    });
    await userEvent.click(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let spaceNode: Text | null = null;
    let node = walker.nextNode();
    while (node !== null) {
      if (node instanceof Text && (node.textContent ?? "").includes(" ")) {
        spaceNode = node;
      }
      node = walker.nextNode();
    }
    await expect(spaceNode).not.toBeNull();
    if (spaceNode === null)
      throw new Error("Expected whitespace after the filter token");
    commitImeText(root, "안녕", spaceNode);
    await expectComposedText(root, "level:ERROR 안녕");
  },
});

export const TestLazyCompletionLoading = meta.story({
  name: "(Test) Controller loads completion values",
  args: { observed: {}, onRequestColumns: fn() },
  render: function LoadingComposer(args) {
    const [observed, setObserved] = useState(args.observed);
    return (
      <ComposerHost
        {...args}
        observed={observed}
        onRequestColumns={(columns) => {
          args.onRequestColumns?.(columns);
          if (columns.includes("userId")) {
            setObserved({ userId: [{ value: "user-123" }] });
          }
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("combobox");
    await expect(args.onRequestColumns).not.toHaveBeenCalled();
    await userEvent.click(input);
    await userEvent.type(input, "userId:");
    await expect(args.onRequestColumns).toHaveBeenCalledWith(["userId"]);
    const body = within(canvasElement.ownerDocument.body);
    const option = await body.findByRole("option", { name: /user-123/ });
    await expect(args.onRequestColumns).toHaveBeenCalledTimes(1);
    await userEvent.click(option);
    await expect(input).toHaveTextContent("user-123");
    await expect(input).toHaveFocus();
  },
});
