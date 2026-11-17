import preview from "@/.storybook/preview";
import { GatewayHero } from "./GatewayHero";

const meta = preview.meta({
  component: GatewayHero,
  // The hero only renders inside the launch dialog, which caps it at 640px.
  decorators: [
    (Story) => (
      <div className="max-w-160">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

/** Short viewports squeeze the dialog, so the hero crops around its center. */
export const Shrunk = meta.story({
  decorators: [
    (Story) => (
      <div className="flex h-48 flex-col">
        <Story />
      </div>
    ),
  ],
});
