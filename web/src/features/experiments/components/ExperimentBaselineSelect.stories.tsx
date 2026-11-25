import { type ComponentProps, useState } from "react";
import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { ExperimentBaselineSelect } from "./ExperimentBaselineSelect";

type Props = ComponentProps<typeof ExperimentBaselineSelect>;

function InteractiveBaselineSelect(args: Props) {
  const [baselineId, setBaselineId] = useState(args.baselineId);

  return (
    <div className="w-80 max-w-full">
      <ExperimentBaselineSelect
        {...args}
        baselineId={baselineId}
        onBaselineChange={(id) => {
          setBaselineId(id);
          args.onBaselineChange(id);
        }}
        onBaselineClear={() => {
          setBaselineId(undefined);
          args.onBaselineClear();
        }}
      />
    </div>
  );
}

const meta = preview.meta({
  component: ExperimentBaselineSelect,
  render: (args) => <InteractiveBaselineSelect {...args} />,
});

export const Default = meta.story({
  args: {
    baselineId: "production",
    onBaselineChange: fn(),
    onBaselineClear: fn(),
    options: [
      {
        type: "group",
        id: "support",
        label: "Support questions",
        options: [
          {
            value: "production",
            label: "Production baseline",
            secondaryLabel: "1h ago",
          },
          {
            value: "revision",
            label: "Prompt revision",
            secondaryLabel: "Yesterday",
          },
        ],
      },
      {
        type: "group",
        id: "billing",
        label: "Billing questions",
        options: [
          {
            value: "billing-run",
            label: "Billing prompt revision",
            secondaryLabel: "2h ago",
          },
        ],
      },
    ],
  },
});
