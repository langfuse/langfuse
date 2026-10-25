import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicsMobileControls } from "./TopicsMobileControls";

const meta = preview.meta({
  component: TopicsMobileControls,
});

export const LongFacetName = meta.story({
  args: {
    facets: [
      { facetId: "intent", name: "Intent" },
      { facetId: "issues", name: "Unresolved customer support issues" },
    ],
    selectedFacet: "issues",
    view: "treemap",
    onSelectFacet: fn(),
    onSelectView: fn(),
  },
  render: (args) => (
    <div className="w-full max-w-[320px]">
      <TopicsMobileControls {...args} />
    </div>
  ),
});
