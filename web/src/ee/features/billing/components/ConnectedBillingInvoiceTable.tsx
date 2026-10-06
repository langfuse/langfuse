import { useState } from "react";

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
    if (invoicesQuery.isFetching) return;
    if (next.pageSize !== pagination.pageSize || next.pageIndex === 0) {
      setPagination({ pageIndex: 0, pageSize: next.pageSize });
      return;
    }
    if (next.pageIndex === pagination.pageIndex) return;
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
      setPagination({ ...next, startingAfter });
      return;
    }
    const endingBefore =
      cursors.prev ?? rows.find((row) => row.id !== "preview")?.id;
    if (!endingBefore) return;
    setPagination({ ...next, endingBefore });
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
