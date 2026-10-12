import { useCallback, useMemo } from "react";
import { Download, ExternalLink } from "lucide-react";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutputs } from "@/src/utils/api";
import { costFormatter } from "@/src/utils/numbers";

export type BillingInvoiceRow = Omit<
  RouterOutputs["cloudBilling"]["getInvoices"]["invoices"][number],
  "created"
> & { created: Date };

type BillingInvoiceTableProps = Pick<
  TableProps<BillingInvoiceRow>,
  "data" | "loadingRowCount"
> & {
  showBreakdownColumns: boolean;
  pagination: PaginationBarProps;
};

export function BillingInvoiceTable({
  showBreakdownColumns,
  pagination,
  ...tableProps
}: BillingInvoiceTableProps) {
  const columns = useMemo<LangfuseColumnDef<BillingInvoiceRow>[]>(
    () => [
      createDateTableColumn<BillingInvoiceRow>({
        accessorKey: "created",
        header: "Date",
        size: 150,
      }),
      createBadgeTableColumn<BillingInvoiceRow>({
        accessorKey: "status",
        header: "Status",
        size: 100,
        range: "semantic",
        nullValue: "-",
        getBadge: (value) => {
          const status = value.toLowerCase();
          const variant = (() => {
            if (status === "paid") return "success";
            if (status === "open") return "warning";
            if (status === "uncollectible" || status === "void") return "error";
            return "unknown";
          })();
          return { value: status, variant };
        },
      }),
      ...(showBreakdownColumns
        ? [
            createNumberTableColumn<BillingInvoiceRow>({
              accessorFn: (row) =>
                (row.breakdown?.subscriptionCents ?? 0) / 100,
              id: "subscription",
              header: "Subscription",
              size: 110,
              formatter: costFormatter,
            }),
            createNumberTableColumn<BillingInvoiceRow>({
              accessorFn: (row) => (row.breakdown?.usageCents ?? 0) / 100,
              id: "usage",
              header: "Usage",
              size: 90,
              formatter: costFormatter,
            }),
            createNumberTableColumn<BillingInvoiceRow>({
              accessorFn: (row) => (row.breakdown?.discountCents ?? 0) / 100,
              id: "discounts",
              header: "Discounts",
              size: 100,
              formatter: costFormatter,
            }),
            createNumberTableColumn<BillingInvoiceRow>({
              accessorFn: (row) => (row.breakdown?.taxCents ?? 0) / 100,
              id: "tax",
              header: "Tax",
              size: 90,
              formatter: costFormatter,
            }),
          ]
        : []),
      createNumberTableColumn<BillingInvoiceRow>({
        accessorFn: (row) => (row.breakdown?.totalCents ?? 0) / 100,
        id: "total",
        header: "Total",
        size: 90,
        formatter: costFormatter,
      }),
    ],
    [showBreakdownColumns],
  );
  const actions = useCallback<
    NonNullable<TableProps<BillingInvoiceRow>["actions"]>
  >(
    (invoice) => [
      ...(invoice.hostedInvoiceUrl
        ? [
            {
              id: "view",
              type: "item" as const,
              title: "View",
              icon: ExternalLink,
              href: invoice.hostedInvoiceUrl,
              linkTarget: "_blank" as const,
            },
          ]
        : []),
      ...(invoice.invoicePdfUrl
        ? [
            {
              id: "pdf",
              type: "item" as const,
              title: "PDF",
              icon: Download,
              href: invoice.invoicePdfUrl,
              linkTarget: "_blank" as const,
            },
          ]
        : []),
    ],
    [],
  );

  return (
    <div className="space-y-2 pt-4">
      <h3 className="font-bold">Invoice History</h3>
      <SettingsTable
        tableName="billing-invoices"
        columns={columns}
        actions={actions}
        pagination={pagination}
        noResultsMessage="No invoices found."
        {...tableProps}
      />
    </div>
  );
}
