import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { Stepper } from "./Stepper";

const meta = preview.meta({ component: Stepper });

export const Default = meta.story({
  args: {
    number: 2,
    title: "Attach evaluators",
    description: "Choose which evaluators should run on matching observations.",
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

export const OutlineStatic = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col">
      <Stepper
        number={1}
        title="Log out of any existing session"
        description="An existing login sends conflicting credentials."
        variant="outline"
        size="sm"
        isCollapsible={false}
        compactBottomSpacing
      >
        <div className="rounded-md border p-3 font-mono text-xs">
          claude /logout
        </div>
      </Stepper>
      <Stepper
        number={2}
        title="Start the agent"
        variant="outline"
        size="sm"
        isCollapsible={false}
        compactBottomSpacing
      >
        <div className="rounded-md border p-3 font-mono text-xs">claude</div>
      </Stepper>
    </div>
  ),
});

export const Statuses = meta.story({
  render: () => (
    <div className="flex max-w-xl flex-col">
      <Stepper
        number={1}
        title="Choose how traffic is recorded"
        status="complete"
        size="sm"
        isCollapsible={false}
        description="Recording usage only"
      />
      <Stepper
        number={2}
        title="Add a provider credential"
        size="sm"
        isCollapsible={false}
      >
        <div className="rounded-md border p-3 text-sm">Add credential</div>
      </Stepper>
      <Stepper
        number={3}
        title="Invite your team"
        status="upcoming"
        size="sm"
        isCollapsible={false}
      />
    </div>
  ),
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
