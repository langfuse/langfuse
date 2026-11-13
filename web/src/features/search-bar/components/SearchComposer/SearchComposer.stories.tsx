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
    <SearchBarStoreProvider
      store={store}
      commit={() =>
        store.getState().draftValid ? store.getState().draft : null
      }
    >
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

export const TestCompactGroupEditing = meta.story({
  name: "(Test) Compact values keep exact matching when edited",
  parameters: {
    a11y: {
      test: "error",
      config: {
        rules: [
          { id: "color-contrast", enabled: true },
          { id: "target-size", enabled: true },
        ],
      },
    },
  },
  args: {
    initialDraft: "name:(request-a OR request-b OR request-c) level:ERROR ",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox");
    const group = canvas.getByRole("button", { name: /Edit.*3 values/ });
    await expect(group).toHaveTextContent("+2");
    await userEvent.click(input);
    const range = document.createRange();
    range.setStartBefore(group.closest("[data-query-source]")!);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await userEvent.keyboard("{ArrowRight}");
    await expect(group).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(input).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(group).toHaveFocus();
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{Enter}");
    let dialog = await body.findByRole("dialog", {
      name: "Edit filter values",
    });
    await expect(group).toHaveAttribute("aria-expanded", "true");
    await expect(group).toHaveAttribute("aria-controls", dialog.id);
    await expect(
      within(dialog).getByRole("checkbox", { name: "request-a" }),
    ).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(group).toHaveFocus());
    await expect(group).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard(" ");
    dialog = await body.findByRole("dialog", { name: "Edit filter values" });
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "request-b" }),
    );
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "request-c" }),
    );
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(input).toHaveFocus();
    await expect(input).toHaveTextContent("name:=request-a");
    await expect(input).toHaveTextContent("level:ERROR");
    await expect(
      canvas.queryByRole("button", { name: /Edit.*values/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(input);
    await userEvent.keyboard("{Meta>}zz{/Meta}");
    await expect(
      canvas.getByRole("button", { name: /Edit.*3 values/ }),
    ).toBeInTheDocument();
    await expect(input).toHaveTextContent("level:ERROR");
    canvas.getByRole("button", { name: /Edit.*3 values/ }).focus();
    await userEvent.keyboard("{Meta>}y{/Meta}");
    await expect(input).toHaveFocus();
    await expect(
      canvas.queryByRole("button", { name: /Edit.*3 values/ }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Meta>}z{/Meta}");
    canvas.getByRole("button", { name: /Edit.*3 values/ }).focus();
    await userEvent.keyboard("{Meta>}a{/Meta}");
    await expect(input).toHaveFocus();
    const clipboard = new DataTransfer();
    input.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
    await expect(clipboard.getData("text/plain")).toBe(args.initialDraft);
    await userEvent.click(
      canvas.getByRole("button", { name: /Edit.*3 values/ }),
    );
  },
});

export const TestInlineKeyEditing = meta.story({
  name: "(Test) Keys edit inline without losing collapsed values",
  args: {
    initialDraft: "id:(request-a OR request-b OR request-c) level:ERROR ",
    observed: { name: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox");
    const values = "(request-a OR request-b OR request-c)";
    await userEvent.click(input);
    const key = input.querySelector('[data-part="field"]')?.firstChild;
    if (key === undefined || key === null)
      throw new Error("Expected the editable ID key");
    const range = document.createRange();
    range.setStart(key, 0);
    range.setEnd(key, 2);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await userEvent.keyboard("n");
    await expect(input.querySelector("[data-query-source]")).toHaveAttribute(
      "data-query-source",
      values,
    );
    await expect(
      canvas.getByRole("button", { name: /Edit.*3 values/ }),
    ).toBeDisabled();
    await userEvent.keyboard("a");
    await userEvent.click(
      await body.findByRole("option", { name: /Observation name/ }),
    );
    await expect(input.querySelector("[data-query-source]")).toHaveAttribute(
      "data-query-source",
      values,
    );
    const group = canvas.getByRole("button", {
      name: "Edit Name any of 3 values",
    });
    await expect(group).toBeEnabled();
    await expect(input).toHaveTextContent("level:ERROR");
    group.focus();
    await userEvent.keyboard("{Meta>}a{/Meta}");
    const clipboard = new DataTransfer();
    input.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
    await expect(clipboard.getData("text/plain")).toBe(
      `name:${values} level:ERROR `,
    );
    await userEvent.click(group);
    await expect(
      await body.findByRole("dialog", { name: "Edit filter values" }),
    ).toBeVisible();
  },
});

export const TestPickerKeyboardFocus = meta.story({
  name: "(Test) Picker keeps keyboard focus while values change",
  parameters: {
    a11y: {
      test: "error",
      config: {
        rules: [
          { id: "color-contrast", enabled: true },
          { id: "target-size", enabled: true },
        ],
      },
    },
  },
  args: {
    initialDraft: `userId:(${Array.from({ length: 13 }, (_, index) => `value-${index}`).join(" OR ")}) `,
    observed: { userId: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: /Edit.*13 values/ }),
    );
    const dialog = await body.findByRole("dialog", {
      name: "Edit filter values",
    });
    await expect(
      within(dialog).getByRole("textbox", { name: "Filter values" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    const checkbox = within(dialog).getByRole("checkbox", { name: "value-0" });
    await expect(checkbox).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      within(dialog).getByRole("checkbox", { name: "value-1" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await expect(
      within(dialog).getByRole("textbox", { name: "Filter values" }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(checkbox).toBeChecked();
    await userEvent.tab();
    const only = within(dialog).getByRole("button", {
      name: "Select only value-0",
    });
    await expect(only).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(only).toHaveFocus();
    await expect(only).toHaveAccessibleName("Select all values");
    await userEvent.keyboard("{Enter}");
    await expect(only).toHaveFocus();
    await expect(canvas.getByRole("combobox")).toBeEmptyDOMElement();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "value-1" }),
    );
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "value-2" }),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /Edit.*3 values/ }),
      ).toHaveFocus(),
    );
  },
});
