import preview from "../../../.storybook/preview";
import { TopicsResultsSkeleton } from "./TopicsResultsSkeleton";

const meta = preview.meta({
  component: TopicsResultsSkeleton,
  render: (args) => (
    <div className="flex h-screen flex-col p-2">
      <TopicsResultsSkeleton {...args} />
    </div>
  ),
});

export const Treemap = meta.story({ args: { view: "treemap" } });

export const Grid = meta.story({ args: { view: "grid" } });
