import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { AddProviderCard } from "./AddProviderCard";

const meta = preview.meta({
  component: AddProviderCard,
  args: { onAdd: fn() },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});
