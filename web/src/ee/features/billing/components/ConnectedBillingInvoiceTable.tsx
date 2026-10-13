import { useRef, useState } from "react";

import { type PaginationBarState } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { api } from "@/src/utils/api";
import { useBillingInformation } from "./useBillingInformation";
import {
  BillingInvoiceTable,
  type BillingInvoiceRow,
} from "./BillingInvoiceTable";

export function ConnectedBillingInvoiceTable() {
  const { organization, billingProvider } = useBillingInformation();
  const [pagination, setPagination] = useState<
    PaginationBarState &
      (
        | { startingAfter?: never; endingBefore?: never }
        | { startingAfter: string; endingBefore?: never }
        | { startingAfter?: never; endingBefore: string }
      )
  >({ pageIndex: 0, pageSize: 10 });
  // Reuse the requests for visited pages even when the current request fails.
  const pageHistory = useRef([pagination]);

  const invoicesQuery = api.cloudBilling.getInvoices.useQuery(
    {
      orgId: organization?.id ?? "",
      limit: pagination.pageSize,
      startingAfter: pagination.startingAfter,
      endingBefore: pagination.endingBefore,
    },
    { enabled: Boolean(organization?.id), retry: false },
  );
  const rows = invoicesQuery.data?.invoices ?? [];
  const hasMore = invoicesQuery.data?.hasMore ?? false;
  const data = ((): AsyncTableData<BillingInvoiceRow[]> => {
    if (invoicesQuery.isPending) return { status: "loading" };
    if (invoicesQuery.isError) {
      return {
        status: "error",
        error: "Failed to load invoices. Please try again.",
      };
    }
    return {
      status: "success",
      data: rows.map((row) => ({ ...row, created: new Date(row.created) })),
    };
  })();

  const onPaginationChange = (next: PaginationBarState) => {
    if (next.pageSize !== pagination.pageSize || next.pageIndex === 0) {
      const firstPage = { pageIndex: 0, pageSize: next.pageSize };
      pageHistory.current = [firstPage];
      setPagination(firstPage);
      return;
    }
    if (next.pageIndex === pagination.pageIndex) return;
    if (next.pageIndex < pagination.pageIndex) {
      const previousPage = pageHistory.current[next.pageIndex];
      if (previousPage) setPagination(previousPage);
      return;
    }
    if (invoicesQuery.isFetching) return;
    const cursors = {
      next: undefined,
      prev: undefined,
      ...invoicesQuery.data?.cursors,
    };
    if (next.pageIndex > pagination.pageIndex) {
      if (!hasMore) return;
      // Preview invoices are not valid provider cursors.
      const startingAfter =
        cursors.next ?? rows.findLast((row) => row.id !== "preview")?.id;
      if (!startingAfter) return;
      const nextPage = {
        pageIndex: next.pageIndex,
        pageSize: next.pageSize,
        startingAfter,
      };
      pageHistory.current[next.pageIndex] = nextPage;
      setPagination(nextPage);
      return;
    }
  };

  return (
    <BillingInvoiceTable
      data={data}
      showBreakdownColumns={billingProvider !== "clickhouse"}
      loadingRowCount={pagination.pageSize}
      pagination={{
        mode: "cursor",
        state: pagination,
        onChange: onPaginationChange,
        hasNextPage: hasMore,
        isLoadingNextPage: invoicesQuery.isFetching,
      }}
    />
  );
}
