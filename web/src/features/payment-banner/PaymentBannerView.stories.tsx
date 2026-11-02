import { expect, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { PaymentBannerView } from "./PaymentBannerView";

const meta = preview.meta({
  component: PaymentBannerView,
  args: {
    organizationName: "handshake",
    billingSettingsHref: "/organization/org-id/settings/billing",
  },
});

/**
 * A payment we could not collect (Stripe `past_due`). Pins to the top of the
 * viewport, as in the app. Narrow the Storybook canvas: the sentence reflows as
 * a whole, keeping the bold title inline with the message, and below `sm` the
 * action drops to its own row so the message keeps the full width.
 */
export const Default = meta.story({});

export const RendersBillingMessage = meta.story({
  name: "(Test) Renders billing message and action",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Billing Issue: We have problems collecting subscription payment for your organization 'handshake'. Please update your payment information to continue using Langfuse.",
    );
    await expect(
      canvas.getByRole("link", { name: "Update Payment" }),
    ).toHaveAttribute("href", "/organization/org-id/settings/billing");
    await expect(
      canvas.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
  },
});

/**
 * Stripe `unpaid` — same layout, destructive colors.
 */
export const Critical = meta.story({
  args: { severity: "critical" },
});

/**
 * Organization names are user-supplied and can be long and unbroken; the
 * message still wraps instead of pushing the action off the strip.
 */
export const LongOrganizationName = meta.story({
  args: {
    organizationName:
      "acme-corporation-platform-engineering-observability-team-production",
  },
});
