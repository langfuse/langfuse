import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { SetupStep } from "./SetupStep";

const meta = preview.meta({ component: SetupStep });

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

export const LastStep = meta.story({
  args: {
    number: 3,
    title: "Test with a sample",
    isLast: true,
    children: <div>Test controls</div>,
  },
});

export const MultiStep = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col">
      <SetupStep number={1} title="Choose evaluator type">
        <div className="rounded-md border p-3 text-sm">LLM-as-a-judge</div>
      </SetupStep>
      <SetupStep number={2} title="Configure output" defaultOpen={false}>
        <div className="rounded-md border p-3 text-sm">Numeric score</div>
      </SetupStep>
      <SetupStep number={3} title="Test with a sample" isLast>
        <div className="rounded-md border p-3 text-sm">Run test</div>
      </SetupStep>
    </div>
  ),
});
