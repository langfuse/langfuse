import { expect, fn, userEvent, within } from "storybook/test";
import { type FilterState } from "@langfuse/shared";
import { type ComponentProps } from "react";
import preview from "../../../../../.storybook/preview";
import { ExperimentFilterSidebarView } from "./ExperimentFilterSidebarView";

const targets = [
  { id: "all", label: "All experiments" },
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
  options,
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
    options: undefined,
    optionsError: "Could not load score options. Try again.",
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
