import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { TextActionButton } from "./TextActionButton";

const meta = preview.meta({
  component: TextActionButton,
  args: { text: "Add message", onClick: fn() },
});

export const Default = meta.story({});

export const Disabled = meta.story({
  args: { text: "Add option", disabled: true },
});

export const Fill = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="w-64 border border-dashed">
      <TextActionButton text="Add message" width="fill" onClick={fn()} />
    </div>
  ),
});
