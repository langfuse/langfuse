import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import { Button } from "@/src/components/ui/button";
import preview from "../../../../../../.storybook/preview";
import { CollapsibleCard } from "./CollapsibleCard";

const meta = preview.meta({ component: CollapsibleCard });

type CollapsibleCardProps = Parameters<typeof CollapsibleCard>[0];

function StatefulCollapsibleCard(args: CollapsibleCardProps) {
  const [, updateArgs] = useArgs<CollapsibleCardProps>();

  return (
    <CollapsibleCard
      {...args}
      onOpenChange={(open) => {
        updateArgs({ open });
        args.onOpenChange(open);
      }}
    />
  );
}

const content = (
  <div className="p-3 text-sm">
    Persistent card content sits below the secondary header surface.
  </div>
);

export const Expanded = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    disabled: false,
    triggerTitle: "Hide details",
    header: <span className="font-bold">Details</span>,
    actions: null,
    children: content,
  },
  render: StatefulCollapsibleCard,
});

export const Collapsed = meta.story({
  args: {
    open: false,
    onOpenChange: fn(),
    disabled: false,
    triggerTitle: "Show details",
    header: <span className="font-bold">Details</span>,
    actions: null,
    children: content,
  },
  render: StatefulCollapsibleCard,
});

export const WithActions = meta.story({
  args: {
    open: true,
    onOpenChange: fn(),
    disabled: false,
    triggerTitle: "Hide variable mapping",
    header: <span className="font-bold">Variable mapping</span>,
    actions: (
      <Button type="button" variant="ghost" size="sm">
        Edit
      </Button>
    ),
    children: content,
  },
  render: StatefulCollapsibleCard,
});

export const Disabled = meta.story({
  args: {
    open: false,
    onOpenChange: fn(),
    disabled: true,
    triggerTitle: "No sample data available",
    header: <span className="font-bold">Sample data</span>,
    actions: null,
    children: content,
  },
  render: StatefulCollapsibleCard,
});
