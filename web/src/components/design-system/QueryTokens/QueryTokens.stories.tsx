import { type ComponentProps } from "react";
import { expect, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { QueryTokens } from "./QueryTokens";
import { WORD_JOINER } from "./QueryTokens.constants";

const meta = preview.meta({
  component: QueryTokens,
  args: {
    value: "status:=open hello",
    tokens: [
      {
        id: "status",
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
    ],
  } satisfies ComponentProps<typeof QueryTokens>,
  render: (args) => (
    <span className="font-mono text-xs leading-6 break-words whitespace-pre-wrap">
      <QueryTokens {...args} />
    </span>
  ),
});

export default meta;

export const Default = meta.story({});
export const Empty = meta.story({ args: { value: "", tokens: [] } });
export const PlainText = meta.story({ args: { tokens: [] } });
export const Highlighted = meta.story({
  args: { highlightedTokenId: "status" },
});
export const Inactive = meta.story({
  args: {
    tokens: [
      {
        id: "status",
        from: 0,
        to: 12,
        raw: "status:=open",
        kind: "filter",
        editable: true,
        error: null,
        explanation: null,
        inactiveReason: "Unavailable on this surface",
      },
    ],
  },
});

export const TestPreservesText = meta.story({
  name: "(Test) Tokens preserve text and manage whitespace",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const token = canvas.getByTestId("search-bar-token");
    const root = token.parentElement;
    if (root === null) throw new Error("Expected token container");
    await expect((root.textContent ?? "").split(WORD_JOINER).join("")).toBe(
      args.value,
    );
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    for (const child of Array.from(root.childNodes)) {
      await expect(child.nodeType).toBe(Node.ELEMENT_NODE);
    }
  },
});
