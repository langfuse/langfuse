import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicsMobileControls } from "./TopicsMobileControls";

const defaultArgs: ComponentProps<typeof TopicsMobileControls> = {
  facets: [
    { facetId: "intent", name: "Intent" },
    { facetId: "issues", name: "Unresolved customer support issues" },
  ],
  selectedFacet: "intent",
  view: "treemap",
  onSelectFacet: fn(),
  onSelectView: fn(),
};

const meta = preview.meta({
  component: TopicsMobileControls,
  args: defaultArgs,
  render: (args) => {
    const [facet, setFacet] = useState(args.selectedFacet);
    const [view, setView] = useState(args.view);
    return (
      <div className="w-full max-w-[320px]">
        <TopicsMobileControls
          {...args}
          selectedFacet={facet}
          view={view}
          onSelectFacet={(value) => {
            setFacet(value);
            args.onSelectFacet(value);
          }}
          onSelectView={(value) => {
            setView(value);
            args.onSelectView(value);
          }}
        />
      </div>
    );
  },
});

export const Default = meta.story({});

export const LongFacetName = meta.story({
  name: "(Test) Long facet names and independent controls",
  args: { selectedFacet: "issues" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const facet = canvas.getByRole("combobox", { name: "Topics facet" });
    const view = canvas.getByRole("combobox", { name: "Topics view" });
    await userEvent.selectOptions(facet, "intent");
    await expect(args.onSelectFacet).toHaveBeenCalledWith("intent");
    await expect(view).toHaveValue("treemap");
    await userEvent.selectOptions(view, "map");
    await expect(args.onSelectView).toHaveBeenCalledWith("map");
    await expect(facet).toHaveValue("intent");
    await userEvent.selectOptions(facet, "issues");
    await expect(args.onSelectFacet).toHaveBeenCalledWith("issues");
    await expect(facet).toHaveValue("issues");
    await expect(view).toHaveValue("map");
  },
});
