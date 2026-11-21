import { expect, fn, screen } from "storybook/test";

import preview from "@/.storybook/preview";
import { bedrockRegionGroups } from "@/src/features/ai-gateway/constants/bedrockRegions";
import { vertexLocationGroups } from "@/src/features/ai-gateway/constants/vertexLocations";
import { RegionField } from "./RegionField";

const bedrock = {
  id: "gateway-bedrock-region",
  label: "AWS region",
  description:
    "Requests go to Bedrock in this region. It can't be changed after saving.",
  groups: bedrockRegionGroups,
};

const meta = preview.meta({
  component: RegionField,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
});

export const Empty = meta.story({
  args: { ...bedrock, value: "", onChange: fn() },
});

export const Selected = meta.story({
  args: { ...bedrock, value: "us-east-1", onChange: fn() },
});

export const VertexLocation = meta.story({
  args: {
    id: "gateway-vertex-location",
    label: "Location",
    description:
      "Requests go to Vertex AI in this location. It can't be changed after saving.",
    groups: vertexLocationGroups,
    value: "global",
    onChange: fn(),
  },
});

export const SearchAndPick = meta.story({
  name: "(Test) Finds a region by name and picks it",
  args: { ...bedrock, value: "", onChange: fn() },
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
