import { expect, fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { ProviderCardPicker } from "./ProviderCardPicker";

const meta = preview.meta({
  component: ProviderCardPicker,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
});

export const OpenAiSelected = meta.story({
  args: { value: "OPENAI", onChange: fn() },
});

export const BedrockSelected = meta.story({
  args: { value: "BEDROCK", onChange: fn() },
});

export const PickProvider = meta.story({
  name: "(Test) Picks a provider by clicking its card",
  args: { value: "OPENAI", onChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: /Amazon Bedrock/ }),
    );
    await expect(args.onChange).toHaveBeenCalledWith("BEDROCK");
  },
});
