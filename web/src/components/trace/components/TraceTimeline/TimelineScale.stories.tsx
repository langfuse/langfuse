import preview from "../../../../../.storybook/preview";
import { TimelineScale } from "./TimelineScale";

const meta = preview.meta({
  component: TimelineScale,
  args: { traceDuration: 8, scaleWidth: 900, stepSize: 1 },
  // The scale is wider than most viewports; host it in a scrollable box.
  decorators: [
    (Story) => (
      <div className="bg-background w-[700px] overflow-x-auto rounded border p-2">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({});

export const SubSecond = meta.story({
  args: { traceDuration: 0.8, stepSize: 0.1 },
});

export const LongTrace = meta.story({
  args: { traceDuration: 300, stepSize: 50 },
});
