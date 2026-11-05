import { expect, fn, screen } from "storybook/test";

import preview from "@/.storybook/preview";
import { BedrockRegionField } from "./BedrockRegionField";

const meta = preview.meta({
  component: BedrockRegionField,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
});

export const Empty = meta.story({
  args: { value: "", onChange: fn() },
});

export const Selected = meta.story({
  args: { value: "us-east-1", onChange: fn() },
});

export const SearchAndPick = meta.story({
  name: "(Test) Finds a region by name and picks it",
  args: { value: "", onChange: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("combobox"));
    await userEvent.type(
      await screen.findByPlaceholderText("Search regions"),
      "frankfurt",
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /Europe \(Frankfurt\)/ }),
    );
    await expect(args.onChange).toHaveBeenCalledWith("eu-central-1");
  },
});
