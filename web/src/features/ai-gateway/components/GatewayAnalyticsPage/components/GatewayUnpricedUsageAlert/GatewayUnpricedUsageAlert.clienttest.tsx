// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";

import { GatewayUnpricedUsageAlert } from "./GatewayUnpricedUsageAlert";

const usage = {
  requests: 12,
  tokens: 3400,
  models: ["custom-model-a"],
};

describe("GatewayUnpricedUsageAlert", () => {
  it("links to organization model settings when the viewer can add model prices", () => {
    render(
      <GatewayUnpricedUsageAlert
        organizationId="org-1"
        canAddModelPrices={true}
        usage={usage}
      />,
    );

    const link = screen.getByRole("link", { name: "Add model prices" });
    expect(link).toHaveAttribute("href", "/organization/org-1/settings/models");
  });

  it("renders the warning without the add-prices action when the viewer lacks permission", () => {
    render(
      <GatewayUnpricedUsageAlert
        organizationId="org-1"
        canAddModelPrices={false}
        usage={usage}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Cost excludes unpriced usage",
    );
    expect(
      screen.queryByRole("link", { name: "Add model prices" }),
    ).not.toBeInTheDocument();
  });
});
