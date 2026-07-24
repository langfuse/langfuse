import preview from "../../../../../.storybook/preview";
import { SetupStep } from "./SetupStep";

const meta = preview.meta({
  component: SetupStep,
});

export const Default = meta.story({
  args: {
    number: 1,
    title: "Choose data to evaluate on",
    description:
      "Filter observations to include only the spans you want to evaluate—extra matches can increase costs—then select one sample to preview the variable mapping.",
    children: (
      <div className="bg-muted rounded-md border p-4 text-sm">Step content</div>
    ),
  },
});

export const Collapsed = meta.story({
  args: {
    number: 2,
    title: "Define the evaluation",
    description:
      "Configure how the evaluator turns the selected sample into a score.",
    defaultOpen: false,
    children: (
      <div className="bg-muted rounded-md border p-4 text-sm">Step content</div>
    ),
  },
});

export const CompactBottomSpacing = meta.story({
  args: {
    number: 2,
    title: "Define the evaluation",
    description:
      "Configure how the evaluator turns the selected sample into a score.",
    compactBottomSpacing: true,
    children: (
      <div className="bg-muted rounded-md border p-4 text-sm">Step content</div>
    ),
  },
});
