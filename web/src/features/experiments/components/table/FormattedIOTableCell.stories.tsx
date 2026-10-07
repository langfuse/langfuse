import { expect, fn, waitFor, type within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { FormattedIOTableCell } from "./FormattedIOTableCell";

const chatMessages = [
  { role: "system", content: "You explain evaluation results clearly." },
  { role: "user", content: "Why did this run pass?" },
  {
    role: "assistant",
    content: "Both checks passed.\n\nThe answer is complete.",
  },
];
const selectRow = fn();

const meta = preview.meta({
  component: FormattedIOTableCell,
  args: {
    projectId: "storybook-project",
    field: "output" as const,
    variant: "output" as const,
  },
});

export const Conversation = meta.story({
  args: { data: chatMessages },
});

export const StructuredData = meta.story({
  args: {
    data: JSON.stringify({
      status: "succeeded",
      summary: "The answer cites its source.\nBoth evaluation checks passed.",
      checks: { grounded: true, complete: true },
    }),
  },
});

export const ToolInvocation = meta.story({
  args: {
    data: {
      role: "assistant",
      tool_calls: [
        {
          id: "call-weather",
          type: "function",
          function: {
            name: "get_weather",
            arguments: JSON.stringify({ city: "San Salvador" }),
          },
        },
      ],
    },
  },
});

export const MultilineText = meta.story({
  args: {
    data: "The first check passed.\n\nThe second check also passed.",
  },
});

export const TestConversation = meta.story({
  name: "(Test) Conversation is readable in the cell",
  args: { data: chatMessages },
  play: async ({ canvas }) => {
    await expectVisibleText(canvas, "user");
    await expectVisibleText(canvas, "assistant");
    await expectVisibleText(canvas, "Why did this run pass?");
    await expectVisibleText(canvas, "The answer is complete.");
  },
});

export const TestStructuredData = StructuredData.extend({
  name: "(Test) Structured data retains fields and multiline content",
  play: async ({ canvas }) => {
    await expectVisibleText(canvas, "status");
    await expectVisibleText(canvas, "succeeded");
    await expectVisibleText(canvas, "summary");
    await expectVisibleText(canvas, /The answer cites its source/);
    await expectVisibleText(canvas, /Both evaluation checks passed/);
  },
});

export const TestToolInvocation = ToolInvocation.extend({
  name: "(Test) Tool calls expose the function and arguments",
  play: async ({ canvas }) => {
    await expectVisibleText(canvas, "get_weather");
    await expectVisibleText(canvas, "city");
    await expectVisibleText(canvas, "San Salvador");
  },
});

export const TestMultilineText = MultilineText.extend({
  name: "(Test) Plain text keeps separate paragraphs",
  play: async ({ canvas }) => {
    await expectVisibleText(canvas, "The first check passed.");
    await expectVisibleText(canvas, "The second check also passed.");
  },
});

export const TestNestedFieldExpansion = meta.story({
  name: "(Test) Expanding a JSON field does not select the containing row",
  args: { data: { checks: { grounded: true, complete: true } } },
  beforeEach: () => {
    selectRow.mockClear();
  },
  render: (args) => (
    <table>
      <tbody>
        <tr onClick={selectRow}>
          <td>
            <FormattedIOTableCell {...args} />
          </td>
        </tr>
      </tbody>
    </table>
  ),
  play: async ({ canvas, userEvent }) => {
    await expectVisibleText(canvas, "checks");
    const key = canvas
      .getAllByText("checks", { exact: true })
      .find((element) => element.checkVisibility());
    if (!key) throw new Error("Visible nested field not found");
    const before = canvas
      .queryAllByText("grounded", { exact: true })
      .filter((element) => element.checkVisibility()).length;
    await userEvent.click(key);
    await waitFor(() =>
      expect(
        canvas
          .queryAllByText("grounded", { exact: true })
          .filter((element) => element.checkVisibility()).length,
      ).not.toBe(before),
    );
    await expect(selectRow).not.toHaveBeenCalled();
  },
});

export const TestTextSelectsRow = Conversation.extend({
  name: "(Test) Conversation text still selects the containing row",
  beforeEach: () => {
    selectRow.mockClear();
  },
  render: (args) => (
    <table>
      <tbody>
        <tr onClick={selectRow}>
          <td>
            <FormattedIOTableCell {...args} />
          </td>
        </tr>
      </tbody>
    </table>
  ),
  play: async ({ canvas, userEvent }) => {
    await expectVisibleText(canvas, "Why did this run pass?");
    const text = canvas
      .getAllByText("Why did this run pass?", { exact: true })
      .find((element) => element.checkVisibility());
    if (!text) throw new Error("Visible conversation text not found");
    await userEvent.click(text);
    await expect(selectRow).toHaveBeenCalledOnce();
  },
});

/** The shared preview keeps a hidden raw alternative alongside the formatted view. */
async function expectVisibleText(
  canvas: ReturnType<typeof within>,
  text: string | RegExp,
) {
  const matches = await canvas.findAllByText(
    text,
    { exact: true },
    { timeout: 10_000 },
  );
  await expect(
    matches.filter((element: HTMLElement) => element.checkVisibility()),
  ).toHaveLength(1);
}
