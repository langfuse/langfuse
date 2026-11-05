import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { FeatureReleaseStatus } from "./FeatureReleaseStatus";

const meta = preview.meta({
  component: FeatureReleaseStatus,
  args: {
    status: "beta" as const,
  },
});

export const Default = meta.story({});

export const AllStatuses = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "default"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          <FeatureReleaseStatus status="beta" size={size} />
          <FeatureReleaseStatus status="new" size={size} />
          <FeatureReleaseStatus status="internal" size={size} />
          <FeatureReleaseStatus status="coming-soon" size={size} />
          <FeatureReleaseStatus status="legacy" size={size} />
        </div>
      ))}
    </div>
  ),
});

export const RendersInCaps = meta.story({
  name: "(Test) Renders In Caps",
  args: { status: "coming-soon" },
  play: async ({ canvas }) => {
    const label = canvas.getByText("Coming soon");
    await expect(getComputedStyle(label).textTransform).toBe("uppercase");
  },
});
