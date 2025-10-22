import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { api } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { Download, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBillingInformation } from "./useBillingInformation";
import { useIsCloudBillingAvailable } from "@/src/ee/features/billing/utils/isCloudBilling";

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
    discountCents: number;
    taxCents: number;
    totalCents: number;
  };
};

export function BillingInvoiceTable() {
  const { organization } = useBillingInformation();
  const isCloudBillingAvailable = useIsCloudBillingAvailable();
  const shouldShowTable =
    isCloudBillingAvailable &&
    Boolean(organization?.cloudConfig?.stripe?.customerId);

  const [virtualTotal, setVirtualTotal] = useState(9999);
  const [paginationState, setPaginationState] = useState<{
    pageIndex: number;
    pageSize: number;
    startingAfter?: string;
    endingBefore?: string;
  }>({ pageIndex: 0, pageSize: 10 });

  const invoicesQuery = api.cloudBilling.getInvoices.useQuery(
    {
      orgId: organization?.id ?? "",
      limit: paginationState.pageSize,
      startingAfter: paginationState.startingAfter,
      endingBefore: paginationState.endingBefore,
    },
    {
      enabled: shouldShowTable,
      retry: false,
    },
  );

  const isFirstPage =
    !paginationState.startingAfter && !paginationState.endingBefore;
  const hasMore = invoicesQuery.data?.hasMore ?? false;

  const rows = useMemo(() => {
    const data = invoicesQuery.data?.invoices ?? [];
    return data.map((i: any) => ({
      id: i.id,
      number: i.number,
      status: i.status ?? null,
      currency: i.currency,
      created: i.created,
      hostedInvoiceUrl: i.hostedInvoiceUrl,
      invoicePdfUrl: i.invoicePdfUrl,
      breakdown: i.breakdown,
    }));
  }, [invoicesQuery.data]);

  const data = useMemo(() => {
    if (invoicesQuery.isPending) {
      return { isLoading: true, isError: false } as const;
    }
    if (invoicesQuery.isError) {
      // setting the error causes the table to remaining in loading state
      // instead we just return an empty array
      return {
        isLoading: false,
        isError: false,
        data: [] as InvoiceRow[],
      } as const;
    }
    return { isLoading: false, isError: false, data: rows } as const;
  }, [rows, invoicesQuery.isPending, invoicesQuery.isError]);

  useEffect(() => {
    if (isFirstPage) setVirtualTotal(9999);
  }, [organization?.id, paginationState.pageSize, isFirstPage]);

  // When we fetch a page that reports hasMore === false, lock in the exact size
  useEffect(() => {
    if (!invoicesQuery.isFetching && !hasMore) {
      const finalCount =
        paginationState.pageIndex * paginationState.pageSize + rows.length;
      setVirtualTotal(finalCount); // one-way only; stays stable afterwards
    }
  }, [
    hasMore,
    invoicesQuery.isFetching,
    paginationState.pageIndex,
    paginationState.pageSize,
    rows.length,
  ]);

  const columns: LangfuseColumnDef<InvoiceRow>[] = [
    {
      accessorKey: "created",
      id: "created",
      header: "Date",
      cell: ({ row }) => {
        const value = row.getValue("created") as InvoiceRow["created"];
        if (!value) return undefined;
        const date = new Date(value);
        const year = date.getFullYear();
        const month = date.toLocaleDateString("en-US", { month: "short" });
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      },
      size: 90,
    },
    {
      accessorKey: "status",
      id: "status",
      header: "Status",
      size: 100,
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
        return usdFormatter(cents / 100, 2, 2);
      },
    },
    {
      accessorKey: "breakdown.usageCents",
      id: "usage",
      header: "Usage",
      size: 90,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.usageCents ?? 0;
        return usdFormatter(cents / 100, 2, 2);
      },
    },
    {
      accessorKey: "breakdown.discountCents",
      id: "discounts",
      header: "Discounts",
      size: 90,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.discountCents ?? 0;
        return usdFormatter(cents / 100, 2, 2);
      },
    },
    {
      accessorKey: "breakdown.taxCents",
      id: "tax",
      header: "Tax",
      size: 90,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.taxCents ?? 0;
        return usdFormatter(cents / 100, 2, 2);
      },
    },
    {
      accessorKey: "breakdown.totalCents",
      id: "total",
      header: "Total",
      size: 90,
      cell: ({ row }) => {
        const cents = row.original.breakdown?.totalCents ?? 0;
        return usdFormatter(cents / 100, 2, 2);
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

  // Helpers to derive cursors from the current page rows (exclude preview) as fallback
  const firstNonPreviewId = rows.find((r) => r.id !== "preview")?.id;
  const lastNonPreviewId = [...rows]
    .reverse()
    .find((r) => r.id !== "preview")?.id;

  // 3) Guard "Next" when already at the end to avoid useless queries + flicker
  const onPaginationChange = (updater: any) => {
    const next =
      typeof updater === "function" ? updater(paginationState) : updater;

    // forward click but no more pages? ignore
    if (next.pageIndex > paginationState.pageIndex && !hasMore) {
      return;
    }

    // ... your existing handler unchanged below
    if (next.pageSize !== paginationState.pageSize) {
      setPaginationState({
        ...next,
        startingAfter: undefined,
        endingBefore: undefined,
      });
      return;
    }
    if (next.pageIndex === paginationState.pageIndex) return;

    const freshNext =
      (invoicesQuery.data as any)?.cursors?.next ?? lastNonPreviewId;
    const freshPrev =
      (invoicesQuery.data as any)?.cursors?.prev ?? firstNonPreviewId;

    if (next.pageIndex === 0 && paginationState.pageIndex > 0) {
      setPaginationState({
        ...next,
        startingAfter: undefined,
        endingBefore: undefined,
      });
    } else if (next.pageIndex > paginationState.pageIndex) {
      setPaginationState({
        ...next,
        startingAfter: freshNext,
        endingBefore: undefined,
      });
    } else {
      setPaginationState({
        ...next,
        startingAfter: undefined,
        endingBefore: freshPrev,
      });
    }
  };

  if (!shouldShowTable) {
    // users on hobby plan who never had a subscription
    return null;
  }

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pt-4">
        <h3 className="text-large font-medium">Invoice History</h3>
      </div>
      <DataTableToolbar columns={columns} />
      <DataTable
        tableName={"invoices"}
        columns={columns}
        data={data}
        pagination={{
          totalCount: virtualTotal,
          hideTotalCount: true,
          canJumpPages: false,
          onChange: onPaginationChange,
          state: {
            pageIndex: paginationState.pageIndex,
            pageSize: paginationState.pageSize,
          },
          options: [10, 20, 30, 40, 50],
        }}
      />
    </div>
  );
}

export default BillingInvoiceTable;
