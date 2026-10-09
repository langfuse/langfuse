import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { TopicsFilters } from "./TopicsFilters";
import { TopicsWorkspaceGate } from "./TopicsWorkspaceGate";

const controls = (
  <TopicsFilters
    facets={[{ facetId: "intent", name: "Intent" }]}
    selectedFacetId="intent"
    onSelectFacet={fn()}
  />
);

const meta = preview.meta({ component: TopicsWorkspaceGate });

export const Loading = meta.story({
  args: {
    isLoading: true,
    fallback: <p>Loading topics…</p>,
    children: controls,
  },
});

export const Loaded = meta.story({
  args: {
    isLoading: false,
    fallback: <p>Loading topics…</p>,
    children: controls,
  },
});

export const WaitsForInitialFacets = meta.story({
  name: "(Test) Waits for initial facets before mounting controls",
  args: {
    isLoading: true,
    fallback: <p>Loading topics…</p>,
    children: controls,
  },
  render: (args) => {
    const [isLoading, setIsLoading] = useState(args.isLoading);
    function completeLoading() {
      setIsLoading(false);
    }
    return (
      <div className="flex flex-col items-start gap-2">
        <TopicsWorkspaceGate {...args} isLoading={isLoading} />
        <Button text="Finish loading" onClick={completeLoading} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Loading topics…")).toBeVisible();
    await expect(
      canvas.queryByRole("tab", { name: "Intent" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Finish loading" }),
    );
    await expect(canvas.queryByText("Loading topics…")).not.toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Intent" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
});
