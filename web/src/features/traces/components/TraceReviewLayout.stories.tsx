import preview from "../../../../.storybook/preview";
import { TraceReviewLayout } from "./TraceReviewLayout";

const meta = preview.meta({
  component: TraceReviewLayout,
  render: (args) => (
    <div className="h-[36rem] min-w-[64rem] overflow-hidden border">
      <TraceReviewLayout {...args} />
    </div>
  ),
});

export const ThreePaneReview = meta.story({
  args: {
    open: true,
    children: ({ collapsed }) => (
      <div
        className={
          collapsed
            ? "bg-muted/30 h-full p-4"
            : "grid h-full grid-cols-[22rem_minmax(0,1fr)]"
        }
      >
        {collapsed ? null : (
          <div className="bg-muted/30 border-r p-4">Trace tree</div>
        )}
        <div className="p-4">Observation detail</div>
      </div>
    ),
    review: <div className="h-full p-4">Annotate</div>,
  },
});
