import { type ComponentProps, useState } from "react";
import { fn } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { HomeDashboardSelect } from "./HomeDashboardSelect";

type Props = ComponentProps<typeof HomeDashboardSelect>;

function InteractiveHomeDashboardSelect(args: Props) {
  const [value, setValue] = useState(args.value);

  return (
    <div className="flex w-full justify-end">
      <HomeDashboardSelect
        {...args}
        value={value}
        onValueChange={(id) => {
          setValue(id);
          args.onValueChange(id);
        }}
      />
    </div>
  );
}

const meta = preview.meta({
  component: HomeDashboardSelect,
  render: (args) => <InteractiveHomeDashboardSelect {...args} />,
});

export const Default = meta.story({
  args: {
    value: "home",
    currentDashboardName: "Langfuse Home",
    onValueChange: fn(),
    options: [
      {
        type: "group",
        id: "project",
        label: "This project",
        options: [{ value: "performance", label: "Performance Overview" }],
      },
      {
        type: "group",
        id: "langfuse",
        label: "Langfuse-maintained",
        options: [
          {
            value: "home",
            label: "Langfuse Home",
            badges: [{ text: "default" }],
          },
          { value: "cost", label: "Langfuse Cost Dashboard" },
        ],
      },
    ],
  },
});
