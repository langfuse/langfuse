import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { TopicsFilters } from "./TopicsFilters";

const filterArgs = {
  facets: [
    { facetId: "intent", name: "Intent" },
    { facetId: "issues", name: "Issues" },
  ],
  selectedFacetId: undefined,
  timeWindow: "7",
  onSelectFacet: fn(),
  onSelectTimeWindow: fn(),
};

const meta = preview.meta({ component: TopicsFilters });

export const Header = meta.story({
  args: { ...filterArgs, layout: "header" },
});

export const Menu = meta.story({
  args: { ...filterArgs, layout: "menu" },
});

export const RetainsSelectionThroughRefresh = meta.story({
  name: "(Test) Retains selection through refresh and falls back after removal",
  args: { ...filterArgs, layout: "header" },
  render: (args) => {
    const [facets, setFacets] = useState(args.facets);
    const [selectedFacetId, setSelectedFacetId] = useState(
      args.selectedFacetId,
    );
    function selectFacet(facetId: string) {
      setSelectedFacetId(facetId);
      args.onSelectFacet(facetId);
    }
    function refreshFacets() {
      setFacets((current) => current.map((facet) => ({ ...facet })));
    }
    function removeSelectedFacet() {
      setFacets((current) =>
        current.filter((facet) => facet.facetId !== selectedFacetId),
      );
    }
    return (
      <div className="flex flex-col items-start gap-2">
        <TopicsFilters
          {...args}
          facets={facets}
          selectedFacetId={selectedFacetId}
          onSelectFacet={selectFacet}
        />
        <Button text="Refresh facets" onClick={refreshFacets} />
        <Button text="Remove selected facet" onClick={removeSelectedFacet} />
      </div>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const picker = canvas.getByRole("combobox", { name: "Topics facet" });
    await expect(picker).toHaveTextContent("Intent");
    await userEvent.click(picker);
    await userEvent.click(body.getByRole("option", { name: "Issues" }));
    await expect(args.onSelectFacet).toHaveBeenCalledWith("issues");
    await expect(picker).toHaveTextContent("Issues");
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh facets" }),
    );
    await expect(picker).toHaveTextContent("Issues");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove selected facet" }),
    );
    await expect(picker).toHaveTextContent("Intent");
  },
});

export const MenuTimeRangeSelection = meta.story({
  name: "(Test) Selects time range from menu controls",
  args: { ...filterArgs, layout: "menu" },
  render: (args) => {
    const [timeWindow, setTimeWindow] = useState(args.timeWindow);
    function selectTimeWindow(value: string) {
      setTimeWindow(value);
      args.onSelectTimeWindow(value);
    }
    return (
      <TopicsFilters
        {...args}
        timeWindow={timeWindow}
        onSelectTimeWindow={selectTimeWindow}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const picker = canvas.getByRole("combobox", { name: "Topics time range" });
    await userEvent.click(picker);
    await userEvent.click(body.getByRole("option", { name: "Last 30 days" }));
    await expect(args.onSelectTimeWindow).toHaveBeenCalledWith("30");
    await expect(picker).toHaveTextContent("Last 30 days");
  },
});
