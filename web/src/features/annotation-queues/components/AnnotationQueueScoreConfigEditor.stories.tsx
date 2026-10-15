import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";

type EditorProps = ComponentProps<typeof AnnotationQueueScoreConfigEditor>;
const configs: EditorProps["scoreConfigs"] = [
  { id: "accuracy", name: "Accuracy", dataType: "NUMERIC", isArchived: false },
  {
    id: "helpfulness",
    name: "Helpfulness",
    dataType: "BOOLEAN",
    isArchived: false,
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
    await userEvent.click(body.getByRole("menuitem", { name: /^Feedback \(/ }));
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
      ).toBeVisible(),
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
