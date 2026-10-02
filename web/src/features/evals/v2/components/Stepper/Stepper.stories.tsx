import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { Stepper } from "./Stepper";

const meta = preview.meta({ component: Stepper });

export const Default = meta.story({
  args: {
    number: 1,
    title: "Choose evaluator type",
    description: "Select how this evaluator should produce a score.",
    children: (
      <div className="rounded-md border p-3 text-sm">LLM as a judge</div>
    ),
  },
});

export const Collapsed = meta.story({
  args: {
    number: 2,
    title: "Configure output",
    defaultOpen: false,
    onOpenChange: fn(),
    children: <div>Score configuration</div>,
  },
});

export const MultiStep = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col">
      <Stepper number={1} title="Choose evaluator type">
        <div className="rounded-md border p-3 text-sm">LLM-as-a-judge</div>
      </Stepper>
      <Stepper number={2} title="Configure output" defaultOpen={false}>
        <div className="rounded-md border p-3 text-sm">Numeric score</div>
      </Stepper>
      <Stepper number={3} title="Test with a sample">
        <div className="rounded-md border p-3 text-sm">Run test</div>
      </Stepper>
    </div>
  ),
});
