import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { BreakdownTooltip } from "./BreakdownTooltip";

const costDetails = {
  input: 0.000012,
  output: 0.000034,
  total: 0.000046,
};

const meta = preview.meta({
  component: BreakdownTooltip,
  parameters: { a11y: { test: "error" } },
});

export default meta;

export const ModelPricing = meta.story({
  args: {
    children: "View cost breakdown",
    details: costDetails,
    isCost: true,
    pricingTierName: "Standard",
    costSource: {
      type: "model",
      href: "/project/project-1/settings/models/model-1?pricingTier=tier-1",
    },
  },
});

export const ProvidedByApplication = meta.story({
  args: {
    children: "View cost breakdown",
    details: costDetails,
    isCost: true,
    costSource: { type: "provided" },
  },
});

export const Aggregate = meta.story({
  args: {
    children: "View aggregate cost breakdown",
    details: [costDetails, { input: 0.00002, output: 0.00001, total: 0.00003 }],
    isCost: true,
  },
});

export const Usage = meta.story({
  args: {
    children: "View usage breakdown",
    details: { input: 12, output: 8, total: 20 },
  },
});

export const TestShowsModelPricingSource = meta.story({
  name: "(Test) Shows model pricing source",
  args: {
    children: "View cost breakdown",
    details: costDetails,
    isCost: true,
    pricingTierName: "Standard",
    costSource: {
      type: "model",
      href: "/project/project-1/settings/models/model-1?pricingTier=tier-1",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "View cost breakdown" }),
    );

    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getAllByText("Cost breakdown").length).toBeGreaterThan(0);
    await expect(body.getAllByText("Standard").length).toBeGreaterThan(0);
    const modelPricingLinks = body.getAllByRole("link", {
      name: /Langfuse model pricing/i,
      hidden: true,
    });
    await expect(modelPricingLinks.length).toBeGreaterThan(0);
    for (const modelPricingLink of modelPricingLinks) {
      await expect(modelPricingLink).toHaveAttribute(
        "href",
        "/project/project-1/settings/models/model-1?pricingTier=tier-1",
      );
    }
  },
});

export const TestShowsProvidedCostSource = meta.story({
  name: "(Test) Shows provided cost source",
  args: {
    children: "View cost breakdown",
    details: costDetails,
    isCost: true,
    costSource: { type: "provided" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "View cost breakdown" }),
    );

    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getAllByText("Provided by application").length,
    ).toBeGreaterThan(0);
    await expect(
      body.queryAllByRole("link", {
        name: /Langfuse model pricing/i,
        hidden: true,
      }),
    ).toHaveLength(0);
  },
});
