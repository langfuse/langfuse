import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Slider } from "./Slider";

type SliderProps = Parameters<typeof Slider>[0];

function StatefulSlider(args: SliderProps) {
  const [value, setValue] = useState(args.value);
  return (
    <div className="flex w-64 items-center gap-3">
      <Slider
        {...args}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange(next);
        }}
      />
      <span className="w-12 font-mono text-sm">{value}%</span>
    </div>
  );
}

const meta = preview.meta({
  component: Slider,
  args: {
    value: 72,
    min: 1,
    max: 100,
    "aria-label": "Sample rate",
    onValueChange: fn(),
  },
  render: StatefulSlider,
});

export const Default = meta.story({});

export const OnMutedSurface = meta.story({
  render: (args) => (
    <div className="bg-muted rounded-lg p-4">
      <StatefulSlider {...args} />
    </div>
  ),
});

export const Disabled = meta.story({ args: { disabled: true } });

export const TestKeyboard = meta.story({
  name: "(Test) Arrow keys change the value",
  play: async ({ args, canvasElement }) => {
    const thumb = within(canvasElement).getByRole("slider", {
      name: "Sample rate",
    });
    thumb.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(args.onValueChange).toHaveBeenCalledWith(73);
  },
});
