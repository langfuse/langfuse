import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Radio } from "./Radio";

const meta = preview.meta({
  component: Radio,
  args: {
    "aria-label": "Sample option",
    onChange: fn(),
  },
});

export const Default = meta.story({});

export const Checked = meta.story({
  args: {
    defaultChecked: true,
  },
});

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});

export const DisabledChecked = meta.story({
  args: {
    defaultChecked: true,
    disabled: true,
  },
});

export const Group = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold">Sample observation</legend>
      {[
        { label: "Checkout generation", value: "checkout" },
        { label: "Support generation", value: "support" },
        { label: "Search generation", value: "search" },
      ].map((option, index) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <Radio
            name="sample-observation"
            value={option.value}
            defaultChecked={index === 0}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  ),
});
