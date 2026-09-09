import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import preview from "../../../../../../../../../.storybook/preview";
import { DateRangeInput } from "./DateRangeInput";

const meta = preview.meta({ component: DateRangeInput });

type DateRangeInputProps = Parameters<typeof DateRangeInput>[0];

function StatefulDateRangeInput(args: DateRangeInputProps) {
  const [, updateArgs] = useArgs<DateRangeInputProps>();

  return (
    <DateRangeInput
      {...args}
      onValueChange={(value) => {
        updateArgs({ value });
        args.onValueChange(value);
      }}
    />
  );
}

export const Default = meta.story({
  args: {
    value: {
      from: "2026-08-31",
      to: "2026-09-07",
    },
    onValueChange: fn(),
  },
  render: StatefulDateRangeInput,
});

export const Bounded = meta.story({
  args: {
    value: {
      from: "2026-08-31",
      to: "2026-09-07",
    },
    min: "2026-03-07",
    max: "2026-09-07",
    onValueChange: fn(),
  },
  render: StatefulDateRangeInput,
});

export const Disabled = meta.story({
  args: {
    value: {
      from: "2026-08-31",
      to: "2026-09-07",
    },
    disabled: true,
    onValueChange: fn(),
  },
  render: StatefulDateRangeInput,
});
