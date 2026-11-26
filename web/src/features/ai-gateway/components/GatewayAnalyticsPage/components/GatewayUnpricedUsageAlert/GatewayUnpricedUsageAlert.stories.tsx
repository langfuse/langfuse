import { expect, within } from "storybook/test";

import preview from "@/.storybook/preview";
import {
  GatewayUnpricedUsageAlert,
  type GatewayUnpricedUsageAlertProps,
} from "./GatewayUnpricedUsageAlert";

const meta = preview.meta({
  component: GatewayUnpricedUsageAlert,
  args: {
    organizationId: "org-1",
    canAddModelPrices: true,
    usage: {
      requests: 12,
      tokens: 3400,
      models: ["custom-model-a"],
    },
  } satisfies GatewayUnpricedUsageAlertProps,
});

export const WithAddPermission = meta.story({
  name: "(Test) Links to organization models when viewer can add prices",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Add model prices" });
    await expect(link).toHaveAttribute(
      "href",
      "/organization/org-1/settings/models",
    );
  },
});

export const WithoutAddPermission = meta.story({
  name: "(Test) Hides add-prices link without permission",
  args: {
    canAddModelPrices: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Cost excludes unpriced usage",
    );
    await expect(
      canvas.queryByRole("link", { name: "Add model prices" }),
    ).toBeNull();
  },
});
