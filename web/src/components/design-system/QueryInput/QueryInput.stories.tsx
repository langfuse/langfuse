import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import {
  QueryInput,
  useQueryInputController,
  type QueryCompletionPlan,
} from "./QueryInput";
import { WORD_JOINER } from "../QueryTokens/QueryTokens.constants";

const meta = preview.meta({
  component: (
    props: Omit<
      Extract<ComponentProps<typeof QueryInput>, { mode?: "editable" }>,
      "controller"
    >,
  ) => {
    const controller = useQueryInputController();
    return <QueryInput {...props} controller={controller} />;
  },
  args: {
    label: "Query",
    value: "",
    diagnostics: [],
    tokens: [],
    placeholder: "Filter… e.g. status:=open",
    onValueChange: fn(),
    onCommit: fn((value: string) => value),
    onRemoveToken: fn(),
    areEquivalent: (left, right) => left.trim() === right.trim(),
    completions: null as QueryCompletionPlan | null,
  },
  render: function ControlledQueryInput(args) {
    const [value, setValue] = useState(args.value);
    const controller = useQueryInputController();
    const completions = (() => {
      if (args.completions !== null) return args.completions;
      const options = ["status:=open", "owner:=me"]
        .filter((suggestion) => suggestion.startsWith(value))
        .map((suggestion) => ({
          id: suggestion,
          label: suggestion,
          section: "Suggested queries",
          edit: {
            next: `${suggestion} `,
            caret: suggestion.length + 1,
            keepOpen: false,
          },
          onApplied: (next: string) => args.onCommit(next, "enter"),
        }));
      if (options.length === 0) return null;
      return { options, autoHighlight: value.length > 0, loading: false };
    })();
    return (
      <QueryInput
        {...args}
        value={value}
        controller={controller}
        completions={completions}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange(next);
        }}
      />
    );
  },
});

export default meta;

const previewTokens: ComponentProps<typeof QueryInput>["tokens"] = [
  {
    id: "filter",
    from: 0,
    to: 12,
    raw: "status:=open",
    kind: "filter",
    editable: true,
    error: null,
    explanation: null,
    inactiveReason: null,
    groups: [
      {
        noWrap: true,
        parts: [
          { text: "status", tone: "field" },
          { text: ":", tone: "muted" },
        ],
      },
      { noWrap: false, parts: [{ text: "=open", tone: "value" }] },
    ],
  },
];

export const Preview = meta.story({
  args: { value: "status:=open", tokens: previewTokens },
  render: ({ value, tokens, size }) => (
    <QueryInput mode="preview" value={value} tokens={tokens} size={size} />
  ),
});
export const PreviewLarge = Preview.extend({ args: { size: "large" } });
export const PreviewEmpty = Preview.extend({ args: { value: "", tokens: [] } });
export const PreviewGroupedQuery = Preview.extend({
  args: {
    value: "(status:=open OR owner:=me) timeout",
    tokens: [
      { raw: "(", kind: "paren" as const },
      { raw: "status:=open", kind: "filter" as const },
      { raw: "OR", kind: "operator" as const },
      { raw: "owner:=me", kind: "filter" as const },
      { raw: ")", kind: "paren" as const },
      { raw: "timeout", kind: "freeText" as const },
    ].map((token, index) => {
      const from = "(status:=open OR owner:=me) timeout".indexOf(token.raw);
      return {
        ...token,
        id: String(index),
        from,
        to: from + token.raw.length,
        editable: true,
        error: null,
        explanation: null,
        inactiveReason: null,
      };
    }),
  },
});
export const PreviewInactive = Preview.extend({
  args: {
    tokens: previewTokens.map((token) => ({
      ...token,
      inactiveReason: "Unavailable on this surface",
    })),
  },
});
export const PreviewInvalid = Preview.extend({
  args: {
    tokens: previewTokens.map((token) => ({
      ...token,
      kind: "invalid",
      groups: undefined,
      error: "Unknown field",
    })),
  },
});
export const TestPreviewPreservesText = Preview.extend({
  name: "(Test) Read-only tokens preserve query text",
  args: { value: "status:=open hello", tokens: previewTokens },
  play: async ({ canvasElement, args }) => {
    const token = within(canvasElement).getByTestId("search-bar-token");
    const root = token.parentElement;
    if (root === null) throw new Error("Expected token container");
    await expect((root.textContent ?? "").split(WORD_JOINER).join("")).toBe(
      args.value,
    );
    await expect(
      within(canvasElement).queryByRole("combobox"),
    ).not.toBeInTheDocument();
    // IME recovery relies on all whitespace/plain text being managed elements.
    for (const child of Array.from(root.childNodes)) {
      await expect(child.nodeType).toBe(Node.ELEMENT_NODE);
    }
  },
});

export const Default = meta.story({});

export const TestWrappingControl = meta.story({
  name: "(Test) Control grows around wrapped query text",
  args: { value: "status:=open owner:=me ".repeat(8) },
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox");
    const surface = canvas.getByTestId("search-bar-surface");
    await expect(input.getBoundingClientRect().height).toBeGreaterThan(32);
    await expect(surface.getBoundingClientRect().height).toBeGreaterThan(
      input.getBoundingClientRect().height,
    );
    await userEvent.click(input);
    await expect(input).toHaveFocus();
    await expect(getComputedStyle(surface).boxShadow).not.toBe("none");
  },
});

export const LoadingSuggestions = meta.story({
  name: "(Test) Loading suggestions",
  args: {
    completions: {
      options: [],
      loading: true,
      autoHighlight: false,
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox"));
    await expect(
      await within(document.body).findByRole("status"),
    ).toHaveTextContent("Loading values…");
  },
});

export const EmptySuggestions = meta.story({
  name: "(Test) Empty suggestions",
  args: {
    completions: {
      options: [],
      loading: false,
      autoHighlight: false,
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox"));
    await expect(
      await within(document.body).findByRole("status"),
    ).toHaveTextContent("No suggestions");
  },
});

export const SuggestionPresentation = meta.story({
  name: "(Test) Suggestion presentation",
  args: {
    completions: {
      options: [
        {
          id: "field",
          label: "rating",
          section: "Fields",
          detail: "Quality rating",
          icon: "search" as const,
          badges: [
            {
              text: "Item",
              color: "blue" as const,
              description: "Item-level rating",
            },
          ],
        },
        {
          id: "pattern",
          label: "rating:>3",
          section: "Patterns",
          detail: "Greater than",
          icon: "syntax" as const,
          labelColor: "teal" as const,
        },
        {
          id: "preset",
          label: "status:=open",
          section: "Saved queries",
          detail: "Used by 8 rules",
          icon: "bookmark" as const,
        },
        {
          id: "recent",
          label: "owner:=me",
          section: "Recent queries",
          icon: "history" as const,
        },
        {
          id: "value",
          label: "open",
          section: "Values",
          detail: "23",
          selected: true,
        },
      ].map((option) => ({
        ...option,
        edit: { next: "", caret: 0, keepOpen: false },
        onApplied: fn(),
      })),
      loading: false,
      autoHighlight: false,
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox"));
    const list = within(await within(document.body).findByRole("listbox"));
    await expect(list.getAllByRole("group")).toHaveLength(5);
    await expect(list.getByText("Item")).toBeInTheDocument();
    await expect(list.getByText("Used by 8 rules")).toBeInTheDocument();
    await expect(list.getByLabelText("selected")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    await expect(
      list.getByRole("option", { name: /rating Item Quality rating/ }),
    ).toHaveAttribute("aria-selected", "true");
  },
});

export const InvalidQuery = meta.story({
  args: {
    value: "unknown:value",
    diagnostics: [{ message: "Unknown field: unknown" }],
  },
});

export const TestScrollableSuggestions = meta.story({
  name: "(Test) Scrollable suggestions",
  args: {
    completions: {
      options: Array.from({ length: 60 }, (_, index) => ({
        id: `option-${index}`,
        label: `Option ${index}`,
        section: "Many suggestions",
        edit: {
          next: `Option ${index}`,
          caret: `Option ${index}`.length,
          keepOpen: false,
        },
        onApplied: fn(),
      })),
      loading: false,
      autoHighlight: false,
    },
  },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("combobox");
    await userEvent.click(input);
    const listbox = await within(document.body).findByRole("listbox");
    for (let index = 0; index < 50; index++)
      await userEvent.keyboard("{ArrowDown}");
    const active = within(listbox).getByRole("option", { selected: true });
    await expect(active).toHaveTextContent("Option 49");
    await expect(input).toHaveAttribute("aria-activedescendant", active.id);
    await expect(input).toHaveFocus();
    await waitFor(() => expect(listbox.scrollTop).toBeGreaterThan(0));
    const bounds = listbox.getBoundingClientRect();
    await expect(active.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      bounds.bottom + 1,
    );
  },
});

export const TestCompletionEdit = meta.story({
  name: "(Test) Completion edit",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Query" });
    await userEvent.click(input);
    await userEvent.type(input, "status");
    await userEvent.keyboard("{Enter}");
    await expect(args.onCommit).toHaveBeenCalledWith("status:=open ", "enter");
    await expect(input).toHaveTextContent("status:=open");
    await userEvent.keyboard("{ControlOrMeta>}z{/ControlOrMeta}");
    await expect(input).toHaveTextContent("status");
  },
});

export const TestSuggestionsKeepEditorFocus = meta.story({
  name: "(Test) Suggestions preserve editor focus",
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("combobox", {
      name: "Query",
    });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(input);
    const listbox = await body.findByRole("listbox", {
      name: "Query suggestions",
    });
    await expect(canvasElement).not.toContainElement(listbox);
    await expect(input).toHaveFocus();
    await userEvent.click(body.getByText("Suggested queries"));
    await expect(input).toHaveFocus();
    await expect(args.onCommit).not.toHaveBeenCalled();
    await userEvent.click(body.getByRole("option", { name: "owner:=me" }));
    await expect(input).toHaveFocus();
    await expect(input).toHaveTextContent("owner:=me");
    await expect(args.onCommit).toHaveBeenCalledWith("owner:=me ", "enter");
    await waitFor(() =>
      expect(body.queryByRole("listbox")).not.toBeInTheDocument(),
    );
  },
});

export const TestControlledSelection = meta.story({
  name: "(Test) Controller selection gates suggestions",
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("combobox");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(input);
    await userEvent.type(input, "status");
    await body.findByRole("listbox");
    // userEvent does not implement native contenteditable Shift+Arrow selection.
    const selection = window.getSelection();
    if (selection === null) throw new Error("Expected browser selection");
    selection.selectAllChildren(input);
    document.dispatchEvent(new Event("selectionchange"));
    await waitFor(() =>
      expect(body.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    selection.collapseToEnd();
    document.dispatchEvent(new Event("selectionchange"));
    await body.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(body.queryByRole("listbox")).not.toBeInTheDocument(),
    );
    await userEvent.keyboard("{ArrowDown}");
    await body.findByRole("listbox");
    await expect(input).toHaveFocus();
  },
});
