import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { api } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { Download, ExternalLink } from "lucide-react";
import { formatLocalIsoDate } from "@/src/components/LocalIsoDate";

type InvoiceRow = {
  id: string;
  number: string | null;
  status: string | null;
  currency: string;
  created: Date;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  breakdown?: {
    subscriptionCents: number;
    usageCents: number;
    taxCents: number;
    totalCents: number;
  };
};

export function BillingInvoiceTable({ orgId }: { orgId: string }) {
  const invoicesQuery = api.cloudBilling.getInvoices.useQuery({ orgId });

  const columns: LangfuseColumnDef<InvoiceRow>[] = [
    {
      accessorKey: "created",
      id: "created",
      header: "Date",
      cell: ({ row }) => {
        const value = row.getValue("created") as InvoiceRow["created"];
        return value
          ? formatLocalIsoDate(new Date(value), false, "day")
          : undefined;
      },
      size: 120,
    },
    {
      accessorKey: "status",
      id: "status",
      header: "Status",
      size: 120,
      cell: ({ row }) => {
        const status = (row.getValue("status") as string | null)?.toLowerCase();
        if (!status) return null;
        const variant =
          status === "paid"
            ? "secondary"
            : status === "open"
              ? "outline"
              : "default";
        return <Badge variant={variant as any}>{status}</Badge>;
      },
    },
    {
      accessorKey: "breakdown.subscriptionCents",
      id: "subscription",
      header: "Subscription",
      size: 100,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.subscriptionCents ?? 0;
        return usdFormatter(cents / 100);
      },
    },
    {
      accessorKey: "breakdown.usageCents",
      id: "usage",
      header: "Usage",
      size: 100,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.usageCents ?? 0;
        return usdFormatter(cents / 100);
      },
    },
    {
      accessorKey: "breakdown.taxCents",
      id: "tax",
      header: "Tax",
      size: 100,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.taxCents ?? 0;
        return usdFormatter(cents / 100);
      },
    },
    {
      accessorKey: "breakdown.totalCents",
      id: "total",
      header: "Total Amount",
      size: 120,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.totalCents ?? 0;
        return usdFormatter(cents / 100);
      },
    },
    {
      accessorKey: "actions",
      id: "actions",
      header: "Actions",
      size: 160,
      cell: ({ row }) => {
        const { hostedInvoiceUrl, invoicePdfUrl } = row.original;
        return (
          <div className="flex gap-2">
            {hostedInvoiceUrl ? (
              <a href={hostedInvoiceUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost">
                  <ExternalLink className="mr-1 h-4 w-4" /> View
                </Button>
              </a>
            ) : null}
            {invoicePdfUrl ? (
              <a href={invoicePdfUrl} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost">
                  <Download className="mr-1 h-4 w-4" /> PDF
                </Button>
              </a>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pt-4">
        <h3 className="text-large font-medium">Invoices</h3>
      </div>
      <DataTableToolbar columns={columns} />
      <DataTable
        tableName={"invoices"}
        columns={columns}
        data={
          invoicesQuery.isPending
            ? { isLoading: true, isError: false }
            : invoicesQuery.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: invoicesQuery.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data:
                    invoicesQuery.data?.invoices.map((i: any) => ({
                      id: i.id,
                      number: i.number,
                      status: i.status ?? null,
                      currency: i.currency,
                      created: i.created,
                      hostedInvoiceUrl: i.hostedInvoiceUrl,
                      invoicePdfUrl: i.invoicePdfUrl,
                      breakdown: i.breakdown,
                    })) ?? [],
                }
        }
      />
    </div>
  );
}

export default BillingInvoiceTable;
