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
  onSelectFacet: fn(),
};

const meta = preview.meta({ component: TopicsFilters });

export const Default = meta.story({
  args: filterArgs,
});

export const RetainsSelectionThroughRefresh = meta.story({
  name: "(Test) Retains selection through refresh and falls back after removal",
  args: filterArgs,
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
    const intent = canvas.getByRole("tab", { name: "Intent" });
    const issues = canvas.getByRole("tab", { name: "Issues" });
    await expect(intent).toHaveAttribute("aria-selected", "true");
    await userEvent.click(issues);
    await expect(args.onSelectFacet).toHaveBeenCalledWith("issues");
    await expect(issues).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh facets" }),
    );
    await expect(issues).toHaveAttribute("aria-selected", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove selected facet" }),
    );
    await expect(intent).toHaveAttribute("aria-selected", "true");
  },
});
