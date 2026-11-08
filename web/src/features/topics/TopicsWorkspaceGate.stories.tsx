import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { Spinner } from "@/src/components/layouts/Spinner";
import { TopicsFacetTabs } from "./TopicsFacetTabs";
import { TopicsWorkspaceGate } from "./TopicsWorkspaceGate";

const controls = (
  <TopicsFacetTabs
    facets={[{ facetId: "intent", name: "Intent" }]}
    selectedFacet="intent"
    onSelectFacet={fn()}
  />
);
const loader = <Spinner message="Loading topics" />;

const meta = preview.meta({ component: TopicsWorkspaceGate });

export const Loading = meta.story({
  args: {
    isLoading: true,
    fallback: loader,
    children: controls,
  },
});

export const Loaded = meta.story({
  args: {
    isLoading: false,
    fallback: loader,
    children: controls,
  },
});

export const WaitsForInitialFacets = meta.story({
  name: "(Test) Waits for initial facets before mounting controls",
  args: {
    isLoading: true,
    fallback: loader,
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
    await expect(
      canvas.getByRole("heading", { name: "Loading topics ..." }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("tab", { name: "Intent" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Finish loading" }),
    );
    // No waitFor: the loader must leave in the render that finishes loading.
    await expect(canvas.queryByRole("heading")).not.toBeInTheDocument();
    await expect(canvas.getByRole("tab", { name: "Intent" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  },
});
