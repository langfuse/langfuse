import { expect, fn, within } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import {
  BillingInvoiceTable,
  type BillingInvoiceRow,
} from "./BillingInvoiceTable";

const invoices: BillingInvoiceRow[] = [
  {
    id: "invoice-1",
    number: "INV-001",
    status: "paid",
    currency: "USD",
    created: new Date("2026-09-01T12:00:00Z"),
    hostedInvoiceUrl: "https://example.com/invoices/1",
    invoicePdfUrl: "https://example.com/invoices/1.pdf",
    breakdown: {
      subscriptionCents: 19900,
      usageCents: 5000,
      discountCents: -1000,
      taxCents: 2000,
      totalCents: 25900,
    },
  },
  {
    id: "preview",
    number: null,
    status: "draft",
    currency: "USD",
    created: new Date("2026-10-01T12:00:00Z"),
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
    breakdown: {
      subscriptionCents: 19900,
      usageCents: 2500,
      discountCents: 0,
      taxCents: 0,
      totalCents: 22400,
    },
  },
];

const defaultArgs = {
  showBreakdownColumns: true,
  pagination: {
    mode: "cursor" as const,
    state: { pageIndex: 0, pageSize: 10 },
    onChange: fn(),
    hasNextPage: true,
  },
};

const meta = preview.meta({
  component: BillingInvoiceTable,
});

export const Stripe = meta.story({
  name: "(Test) Stripe",
  args: { ...defaultArgs, data: { status: "success", data: invoices } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      canvas.getByRole("columnheader", { name: "Subscription" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Open actions menu" })[0]!,
    );
    const menu = within(canvasElement.ownerDocument.body);
    await expect(menu.getByRole("menuitem", { name: "View" })).toHaveAttribute(
      "href",
      invoices[0]!.hostedInvoiceUrl,
    );
    await expect(menu.getByRole("menuitem", { name: "PDF" })).toHaveAttribute(
      "href",
      invoices[0]!.invoicePdfUrl,
    );
    await userEvent.keyboard("{Escape}");
  },
});

export const ClickHouse = meta.story({
  name: "(Test) ClickHouse",
  args: {
    ...defaultArgs,
    showBreakdownColumns: false,
    data: { status: "success", data: [invoices[0]!] },
    pagination: {
      mode: "cursor",
      state: { pageIndex: 0, pageSize: 10 },
      onChange: fn(),
      hasNextPage: false,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("columnheader", { name: "Subscription" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("columnheader", { name: "Total" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Go to next page" }),
    ).toBeDisabled();
  },
});

export const Loading = meta.story({
  args: { ...defaultArgs, data: { status: "loading" }, loadingRowCount: 5 },
});

export const Empty = meta.story({
  args: { ...defaultArgs, data: { status: "success", data: [] } },
});

export const Error = meta.story({
  args: {
    ...defaultArgs,
    data: {
      status: "error",
      error: "Failed to load invoices. Please try again.",
    },
  },
});
