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
    <div className="flex flex-wrap items-center gap-2">
      <FeatureReleaseStatus status="beta" />
      <FeatureReleaseStatus status="new" />
      <FeatureReleaseStatus status="internal" />
      <FeatureReleaseStatus status="coming-soon" />
      <FeatureReleaseStatus status="legacy" />
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
