import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";

type EditorProps = ComponentProps<typeof AnnotationQueueScoreConfigEditor>;
const configs: EditorProps["scoreConfigs"] = [
  {
    id: "accuracy",
    name: "Accuracy",
    dataType: "NUMERIC",
    isArchived: false,
    minValue: 1,
    maxValue: 5,
  },
  {
    id: "helpfulness",
    name: "Helpfulness",
    dataType: "BOOLEAN",
    isArchived: false,
    categories: [
      { label: "True", value: 1 },
      { label: "False", value: 0 },
    ],
  },
  { id: "feedback", name: "Feedback", dataType: "TEXT", isArchived: false },
  {
    id: "legacy",
    name: "Legacy quality",
    dataType: "NUMERIC",
    isArchived: true,
  },
];
const largeConfigs: EditorProps["scoreConfigs"] = Array.from(
  { length: 120 },
  (_, index) => ({
    id: `config-${index}`,
    name: `Review dimension ${String(index + 1).padStart(3, "0")} — response quality and grounding`,
    dataType: "NUMERIC",
    isArchived: false,
  }),
);
const baseArgs: EditorProps = {
  scoreConfigs: configs,
  value: ["helpfulness", "accuracy"],
  onChange: fn(),
  createAction: { disabled: undefined, onClick: fn() },
  editAction: { disabled: undefined, onClick: fn() },
  warnOnRemoval: false,
  disabled: false,
};
function StatefulEditor(args: EditorProps) {
  const [value, setValue] = useState(args.value);
  return (
    <div className="w-[620px] max-w-full">
      <AnnotationQueueScoreConfigEditor
        {...args}
        value={value}
        onChange={(ids) => {
          setValue(ids);
          args.onChange(ids);
        }}
      />
    </div>
  );
}
const meta = preview.meta({ component: AnnotationQueueScoreConfigEditor });

export const Default = meta.story({ args: baseArgs, render: StatefulEditor });
export const FieldPreviews = meta.story({
  args: {
    ...baseArgs,
    scoreConfigs: [
      ...configs,
      {
        id: "quality",
        name: "Quality",
        dataType: "CATEGORICAL",
        isArchived: false,
        description:
          "How well does the answer address the request, including all the relevant details?\nConsider clarity and completeness.",
        categories: [
          { label: "Poor", value: 0 },
          { label: "Good", value: 1 },
          { label: "Great", value: 2 },
        ],
      },
    ],
    value: ["quality", "helpfulness", "accuracy", "feedback"],
  },
  render: (args) => (
    <div className="w-80">
      <StatefulEditor {...args} />
    </div>
  ),
});
export const ManyScoreConfigs = meta.story({
  args: {
    ...baseArgs,
    scoreConfigs: largeConfigs,
    value: largeConfigs.slice(0, 80).map((config) => config.id),
  },
  render: StatefulEditor,
});
export const Empty = meta.story({
  args: { ...baseArgs, scoreConfigs: [], value: [] },
  render: StatefulEditor,
});

export const TestKeyboardReorderAndAdd = meta.story({
  name: "(Test) Keyboard Reorder and Add Preserve Order",
  args: { ...baseArgs, onChange: fn() },
  render: StatefulEditor,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const handle = canvas.getByRole("button", { name: "Reorder Helpfulness" });
    handle.focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard(" ");
    await waitFor(() =>
      expect(args.onChange).toHaveBeenLastCalledWith([
        "accuracy",
        "helpfulness",
      ]),
    );
    const rows = within(
      canvas.getByRole("list", { name: "Selected score configs" }),
    ).getAllByRole("listitem");
    await expect(within(rows[0]!).getByText("Accuracy")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await expect(
      body.queryByRole("menuitem", { name: /^Accuracy/ }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: /^Helpfulness/ }),
    ).not.toBeInTheDocument();
    await expect(
      body.queryByRole("menuitem", { name: /^Legacy quality/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("menuitem", { name: "Feedback" }));
    await expect(args.onChange).toHaveBeenLastCalledWith([
      "accuracy",
      "helpfulness",
      "feedback",
    ]);
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
    await expect(
      canvas.getAllByRole("button", { name: /^Reorder / }),
    ).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await expect(
      body.queryByRole("menuitem", { name: /^Feedback/ }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
});

export const TestCreateAfterNoSearchResults = meta.story({
  name: "(Test) Create Score Config After No Search Results",
  args: {
    ...baseArgs,
    createAction: { disabled: undefined, onClick: fn() },
  },
  render: StatefulEditor,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await userEvent.type(
      body.getByPlaceholderText("Search scores..."),
      "No matching score config",
    );
    await expect(
      body.queryByRole("menuitem", { name: /^Feedback/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("menuitem", { name: "Add score config" }),
    );
    await expect(args.createAction.onClick).toHaveBeenCalledOnce();
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
  },
});

export const TestCancelRemoval = meta.story({
  name: "(Test) Cancel Removal Keeps Selection",
  args: { ...baseArgs, warnOnRemoval: true, onChange: fn() },
  render: StatefulEditor,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Accuracy from queue" }),
    );
    const confirmation = await body.findByRole("dialog", {
      name: "Remove score configs from queue?",
    });
    await userEvent.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );
    await expect(args.onChange).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Reorder Accuracy" }),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Accuracy from queue" }),
    );
    const secondConfirmation = await body.findByRole("dialog", {
      name: "Remove score configs from queue?",
    });
    await userEvent.click(
      within(secondConfirmation).getByRole("button", {
        name: "Remove from queue",
      }),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(["helpfulness"]);
    await expect(
      canvas.queryByRole("button", { name: "Reorder Accuracy" }),
    ).not.toBeInTheDocument();
  },
});

export const TestDescriptionOverflow = meta.story({
  name: "(Test) Description Disclosure Follows Available Width",
  args: {
    ...baseArgs,
    scoreConfigs: [
      {
        ...configs[0]!,
        id: "responsive-description",
        description: "Check correctness and completeness of the answer.",
      },
    ],
    value: ["responsive-description"],
  },
  render: (args) => (
    <div data-testid="responsive-editor" style={{ width: 620 }}>
      <StatefulEditor {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const container = canvas.getByTestId("responsive-editor");
    const toggle = () =>
      canvas.queryByRole("button", { name: /description for Accuracy/ });
    await waitFor(() => expect(toggle()).not.toBeInTheDocument());
    container.style.width = "200px";
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    toggle()?.focus();
    await waitFor(() => expect(toggle()).toBeVisible());
    const collapse = canvas.queryByRole("button", {
      name: "Hide description for Accuracy",
    });
    if (collapse) await userEvent.click(collapse);
    container.style.width = "620px";
    await waitFor(() => expect(toggle()).not.toBeInTheDocument());
    container.style.width = "200px";
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    toggle()?.focus();
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Show description for Accuracy" }),
      ).toBeVisible(),
    );
  },
});

export const TestRowHoverShowsConfigDetails = meta.story({
  name: "(Test) Row Hover Shows Config Details",
  args: {
    ...baseArgs,
    value: [],
    onChange: fn(),
    scoreConfigs: [
      ...configs,
      {
        id: "quality",
        name: "Quality",
        dataType: "CATEGORICAL",
        isArchived: false,
        description: `Overall answer quality.\nUse Excellent sparingly.\n${"Keep this guidance with the config.\n".repeat(80)}`,
        categories: [
          { label: "Bad", value: 0 },
          { label: "Good", value: 1 },
        ],
      },
      {
        id: "tokens",
        name: "Token estimate",
        dataType: "NUMERIC",
        isArchived: false,
      },
    ] satisfies EditorProps["scoreConfigs"],
  },
  render: StatefulEditor,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const hoverRow = async (name: string) => {
      const row = body.getByRole("menuitem", { name });
      const rect = row.getBoundingClientRect();
      const hit = row.ownerDocument.elementFromPoint(
        rect.left + 12,
        rect.top + rect.height / 2,
      );
      if (!hit) throw new Error(`no hit for ${name}`);
      await userEvent.hover(hit);
    };
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await hoverRow("Quality");
    const tooltip = await body.findByRole("tooltip");
    await waitFor(() =>
      expect(body.getByText(/Overall answer quality/)).toBeVisible(),
    );
    await expect(tooltip).toHaveTextContent("Quality");
    await expect(tooltip.querySelector(".ph-no-capture")).not.toBeNull();
    await expect(tooltip.style.maxHeight).toMatch(/px$/);
    expect(getComputedStyle(tooltip).overflowY).toBe("auto");
    expect(tooltip.scrollHeight).toBeGreaterThan(tooltip.clientHeight);
    tooltip.scrollTop = tooltip.scrollHeight;
    expect(tooltip.scrollTop).toBeGreaterThan(0);
    await userEvent.hover(tooltip);
    await expect(body.getByText(/Overall answer quality/)).toBeVisible();
    await expect(body.getByText(/Use Excellent sparingly/)).toBeVisible();
    await expect(body.getByText("Categorical")).toBeVisible();
    await expect(body.getByText("Bad · Good")).toBeVisible();
    await hoverRow("Feedback");
    await waitFor(() => expect(body.getByText("No description")).toBeVisible());
    await expect(body.getByText("Free text")).toBeVisible();
    await hoverRow("Token estimate");
    await waitFor(() => expect(body.getByText("Any number")).toBeVisible());
    await hoverRow("Accuracy");
    await waitFor(() => expect(body.getByText("1 – 5")).toBeVisible());
    await userEvent.click(body.getByRole("menuitem", { name: "Accuracy" }));
    await expect(args.onChange).toHaveBeenLastCalledWith(["accuracy"]);
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
    await expect(canvas.getByText("Accuracy")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add score" }));
    await hoverRow("Feedback");
    await waitFor(() => expect(body.getByRole("tooltip")).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
    await expect(body.queryByRole("tooltip")).not.toBeInTheDocument();
  },
});
