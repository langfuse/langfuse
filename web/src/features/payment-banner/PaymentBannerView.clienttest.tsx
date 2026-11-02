import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaymentBannerView } from "./PaymentBannerView";

describe("PaymentBannerView", () => {
  it("renders the billing strip markup", () => {
    const { container } = render(
      <PaymentBannerView
        organizationName="handshake"
        billingSettingsHref="/organization/org-id/settings/billing"
      />,
    );

    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<div class="flex w-full flex-col gap-1 px-4 py-1.5 sm:flex-row sm:items-center sm:gap-3 sm:py-1 bg-foreground text-background" role="alert" aria-live="polite"><div class="flex min-w-0 flex-1 items-start gap-3 sm:items-center"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-alert mt-0.5 sm:mt-0" aria-hidden="true" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line></svg><p class="min-w-0 text-sm wrap-break-word"><span class="font-bold">Billing Issue:</span> We have problems collecting subscription payment for your organization 'handshake'. Please update your payment information to continue using Langfuse.</p></div><a class="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-6 rounded-md px-2.5 shrink-0 self-end sm:self-auto" type="button" href="/organization/org-id/settings/billing"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card mr-2" aria-hidden="true" style="flex-shrink: 0; color: hsl(var(--icon-foreground));"><rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" x2="22" y1="10" y2="10"></line></svg>Update Payment</a></div>"`,
    );
  });

  it("renders the critical severity markup", () => {
    const { container } = render(
      <PaymentBannerView
        organizationName="handshake"
        billingSettingsHref="/organization/org-id/settings/billing"
        severity="critical"
      />,
    );

    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<div class="flex w-full flex-col gap-1 px-4 py-1.5 sm:flex-row sm:items-center sm:gap-3 sm:py-1 bg-destructive text-destructive-foreground" role="alert" aria-live="polite"><div class="flex min-w-0 flex-1 items-start gap-3 sm:items-center"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-alert mt-0.5 sm:mt-0" aria-hidden="true" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line></svg><p class="min-w-0 text-sm wrap-break-word"><span class="font-bold">Billing Issue:</span> We have problems collecting subscription payment for your organization 'handshake'. Please update your payment information to continue using Langfuse.</p></div><a class="inline-flex items-center justify-center whitespace-nowrap text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-6 rounded-md px-2.5 shrink-0 self-end sm:self-auto" type="button" href="/organization/org-id/settings/billing"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card mr-2" aria-hidden="true" style="flex-shrink: 0; color: hsl(var(--icon-foreground));"><rect width="20" height="14" x="2" y="5" rx="2"></rect><line x1="2" x2="22" y1="10" y2="10"></line></svg>Update Payment</a></div>"`,
    );
  });
});
