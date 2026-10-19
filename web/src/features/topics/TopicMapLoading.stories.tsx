import { expect, fn, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { EmbeddingMapView } from "./EmbeddingMapView";
import { TopicMapLoading } from "./TopicMapLoading";

const meta = preview.meta({
  component: TopicMapLoading,
  render: (args) => (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex h-[680px] min-h-0 flex-col">
        <TopicMapLoading {...args} />
      </div>
      <div className="flex h-[680px] min-h-0 flex-col">
        <EmbeddingMapView
          projectId="project"
          data={{ points: [], missingSummaryCount: 0, unpositionedCount: 0 }}
          topics={[]}
          selectedTopic={null}
          selectedTraceId={null}
          onSelectTopic={fn()}
          onSelectTrace={fn()}
          onOpenTrace={fn()}
          fillContainer={args.fillContainer}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const loading = canvas.getByRole("status");
    const loaded = canvas.getByRole("region", { name: "Embedding map" });
    await waitFor(() => {
      const loadingBounds = loading.getBoundingClientRect();
      const loadedBounds = loaded.getBoundingClientRect();
      expect(loadingBounds.width).toBeCloseTo(loadedBounds.width, 1);
      expect(loadingBounds.height).toBeCloseTo(loadedBounds.height, 1);
    });
  },
});

export const FillContainer = meta.story({
  name: "(Test) Loading matches loaded container size",
  args: { fillContainer: true },
});

export const Standalone = meta.story({
  name: "(Test) Loading matches loaded standalone size",
  args: { fillContainer: false },
});
