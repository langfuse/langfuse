import { fireEvent, render, screen } from "@testing-library/react";

import { BreakdownTooltip } from "./BreakdownTooltip";

describe("BreakdownTooltip", () => {
  it("links a Langfuse-calculated generation cost to its matched pricing tier", async () => {
    render(
      <BreakdownTooltip
        details={{ input: 0.001, output: 0.002, total: 0.003 }}
        isCost
        priceSource={{
          projectId: "project-1",
          modelId: "model-1",
          modelName: "gpt-5.6",
          pricingTierId: "tier-priority",
          pricingTierName: "Priority",
        }}
      >
        <span>Show breakdown</span>
      </BreakdownTooltip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show breakdown" }));

    const link = (
      await screen.findAllByRole("link", {
        name: "Prices from gpt-5.6 · Priority",
      })
    )[0]!;
    expect(link).toHaveAttribute(
      "href",
      "/project/project-1/settings/models/model-1?pricingTier=tier-priority",
    );
    expect(link).toHaveClass("text-xs", "italic");
  });

  it("does not show pricing attribution for usage breakdowns", async () => {
    render(
      <BreakdownTooltip
        details={{ input: 100, output: 50, total: 150 }}
        priceSource={{
          projectId: "project-1",
          modelId: "model-1",
          modelName: "gpt-5.6",
          pricingTierId: "tier-priority",
          pricingTierName: "Priority",
        }}
      >
        <span>Show breakdown</span>
      </BreakdownTooltip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show breakdown" }));

    expect(
      screen.queryByRole("link", {
        name: "Prices from gpt-5.6 · Priority",
      }),
    ).not.toBeInTheDocument();
  });
});
