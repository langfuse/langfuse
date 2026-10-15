import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type FilterState } from "@langfuse/shared";
import { type ComponentProps } from "react";
import preview from "../../../../../.storybook/preview";
import { ExperimentFilterSidebarView } from "./ExperimentFilterSidebarView";

const targets = [
  { id: "all", label: "All selected experiments" },
  { id: "baseline", label: "Baseline" },
  { id: "run-a", label: "Run A" },
  { id: "run-b", label: "Run B" },
];
const options = {
  scores_avg: ["passed", "rating", "quality"],
  score_categories: { rating: ["good"] },
  score_booleans: ["passed"],
  level: ["DEFAULT", "ERROR"],
};
const optionsByTarget = Object.fromEntries(
  targets.map(({ id }) => [id, options]),
);
const numeric = (
  target: string,
): Extract<FilterState[number], { type: "numberObject" }> => ({
  column: "scores_avg",
  type: "numberObject",
  key: "quality",
  operator: ">",
  value: 0.8,
  target,
});

const defaultArgs: ComponentProps<typeof ExperimentFilterSidebarView> = {
  filters: [],
  targets,
  optionsByTarget,
  legacyDefaultTarget: "baseline",
  optionsError: null,
  layout: "panel",
  isCollapsed: false,
  onApply: fn(),
  onRemove: fn(),
  onClearAll: fn(),
  onRetryOptions: fn(),
  onOpenChange: fn(),
  onActiveOnlyChange: fn(),
};
const meta = preview.meta({
  component: ExperimentFilterSidebarView,
  args: defaultArgs,
});

export const Empty = meta.story({});
export const RepeatedScores = meta.story({
  args: { filters: [numeric("run-a"), numeric("run-b")] },
});
export const OptionsUnavailable = meta.story({
  args: {
    filters: [numeric("run-a")],
    optionsByTarget: {},
    optionsError: "Could not load score options. Try again.",
  },
});

export const ImmediateDefaults = meta.story({
  name: "(Test) Applies each displayed default immediately",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const defaults: Array<{ label: string; filter: FilterState[number] }> = [
      {
        label: "Numeric score",
        filter: { ...numeric("all"), operator: ">=", value: 0 },
      },
      {
        label: "Status",
        filter: {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["DEFAULT"],
          target: "all",
        },
      },
      {
        label: "Categorical score",
        filter: {
          column: "score_categories",
          type: "categoryOptions",
          key: "rating",
          operator: "any of",
          value: ["good"],
          target: "all",
        },
      },
      {
        label: "Boolean score",
        filter: {
          column: "score_booleans",
          type: "booleanObject",
          key: "passed",
          operator: "=",
          value: true,
          target: "all",
        },
      },
    ];
    for (const { label, filter } of defaults) {
      const trigger = canvas.getByRole("button", { name: "Add filter" });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(trigger);
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
      const dialog = within(await page.findByRole("dialog"));
      await expect(canvas.queryByRole("form")).toBeNull();
      await userEvent.click(dialog.getByRole("button", { name: label }));
      await expect(args.onApply).toHaveBeenLastCalledWith(filter);
      await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  },
});

export const MetadataCancellation = meta.story({
  name: "(Test) Discards metadata setup until a complete key is submitted",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Add filter" }));
    await userEvent.click(
      within(await page.findByRole("dialog")).getByRole("button", {
        name: "Item metadata",
      }),
    );
    let dialog = within(page.getByRole("dialog"));
    await expect(
      dialog.getByRole("button", { name: "Add filter" }),
    ).toBeDisabled();
    await userEvent.type(
      dialog.getByRole("textbox", { name: "Metadata key" }),
      "discarded",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await expect(args.onApply).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Add filter" }));
    await userEvent.click(
      within(await page.findByRole("dialog")).getByRole("button", {
        name: "Item metadata",
      }),
    );
    dialog = within(page.getByRole("dialog"));
    await expect(
      dialog.getByRole("textbox", { name: "Metadata key" }),
    ).toHaveValue("");
    await userEvent.type(
      dialog.getByRole("textbox", { name: "Metadata key" }),
      "region",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add filter" }));
    await expect(args.onApply).toHaveBeenCalledTimes(1);
    await expect(args.onApply).toHaveBeenCalledWith({
      column: "itemMetadata",
      type: "stringObject",
      key: "region",
      operator: "is set",
      value: "",
      target: "all",
    });
  },
});

export const RetargetOneOccurrence = meta.story({
  name: "(Test) Retargets and removes individual repeated conditions",
  args: { filters: [numeric("run-a"), numeric("run-b")] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const [first, second] = canvas.getAllByRole("form", {
      name: "Numeric score filter",
    });
    await userEvent.click(
      within(first).getByRole("combobox", { name: "Filter experiment" }),
    );
    await userEvent.click(
      await page.findByRole("option", { name: "Baseline" }),
    );
    await userEvent.click(
      await within(first).findByRole("button", { name: "Apply changes" }),
    );
    await expect(args.onApply).toHaveBeenCalledTimes(1);
    await expect(args.onApply).toHaveBeenCalledWith(numeric("baseline"), 0);
    await expect(
      within(second).getByRole("combobox", { name: "Filter experiment" }),
    ).toHaveTextContent("Run B");
    await userEvent.click(
      within(second).getByRole("button", {
        name: "Remove Numeric score filter",
      }),
    );
    await expect(args.onRemove).toHaveBeenCalledTimes(1);
    await expect(args.onRemove).toHaveBeenCalledWith(1);
  },
});

export const IncompatibleScoreType = meta.story({
  name: "(Test) Keeps a condition applied when the chosen experiment has another score type",
  args: {
    filters: [numeric("run-a")],
    optionsByTarget: {
      ...optionsByTarget,
      "run-b": { score_categories: { quality: ["good"] } },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter experiment" }),
    );
    await userEvent.click(await page.findByRole("option", { name: "Run B" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("different type");
    await expect(
      canvas.getByRole("button", { name: "Apply changes" }),
    ).toBeDisabled();
    await expect(args.onApply).not.toHaveBeenCalled();
  },
});

export const RetryFailedOptions = meta.story({
  name: "(Test) Failed options offer retry and block score edits without perpetual loading",
  args: {
    filters: [numeric("run-a")],
    optionsByTarget: {},
    optionsError: "Could not load score options. Try again.",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(
      canvas.getByRole("textbox", { name: "Filter value" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Filter value" }),
      "0.7",
    );
    await expect(
      canvas.getByRole("button", { name: "Apply changes" }),
    ).toBeDisabled();
    await expect(canvas.queryByRole("status")).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry options" }),
    );
    await expect(args.onRetryOptions).toHaveBeenCalledTimes(1);
    await expect(args.onApply).not.toHaveBeenCalled();
  },
});

export const ActiveOnlyCatalog = meta.story({
  name: "(Test) Inactive catalog adds filters without creating draft cards",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show only active" }),
    );
    await expect(args.onActiveOnlyChange).toHaveBeenCalledTimes(1);
    await expect(args.onActiveOnlyChange).toHaveBeenCalledWith(false);
    await expect(canvas.getByText("Available filters")).toBeVisible();
    await expect(canvas.queryByRole("form")).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Numeric score" }),
    );
    await expect(args.onApply).toHaveBeenCalledTimes(1);
    await expect(args.onApply).toHaveBeenCalledWith({
      ...numeric("all"),
      operator: ">=",
      value: 0,
    });
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "Metadata" }));
    const dialog = within(await page.findByRole("dialog"));
    await userEvent.type(
      dialog.getByRole("textbox", { name: "Metadata key" }),
      "region",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add filter" }));
    await expect(args.onApply).toHaveBeenLastCalledWith({
      column: "eventMetadata",
      type: "stringObject",
      key: "region",
      operator: "is set",
      value: "",
      target: "all",
    });
  },
});

export const LoadingScoreOptions = meta.story({
  name: "(Test) Loading score options disable creation and retargeted edits",
  args: { filters: [numeric("run-a")], optionsByTarget: { "run-a": options } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter experiment" }),
    );
    await userEvent.click(await page.findByRole("option", { name: "Run B" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Waiting for score options",
    );
    await expect(
      canvas.getByRole("button", { name: "Apply changes" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Add filter" }));
    const dialog = within(await page.findByRole("dialog"));
    await expect(
      dialog.getByRole("button", { name: "Numeric score" }),
    ).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Status" })).toBeEnabled();
    await expect(args.onApply).not.toHaveBeenCalled();
  },
});

export const InlineCreation = meta.story({
  name: "(Test) Inline creation uses its local portal and applies status",
  args: { layout: "inline" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add filter" }));
    const dialog = await canvas.findByRole("dialog");
    await expect(dialog.closest('[data-layer="popover"]')).not.toBeNull();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Status" }),
    );
    await expect(args.onApply).toHaveBeenCalledTimes(1);
    await expect(args.onApply).toHaveBeenCalledWith({
      column: "level",
      type: "stringOptions",
      operator: "any of",
      value: ["DEFAULT"],
      target: "all",
    });
  },
});
