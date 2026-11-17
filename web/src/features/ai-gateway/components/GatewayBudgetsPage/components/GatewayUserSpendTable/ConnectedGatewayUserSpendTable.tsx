import { type ComponentProps, useState } from "react";

import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import type { GatewayAnalyticsFetchQuery } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/hooks/useGatewayAnalyticsFetchQuery";
import { selectGatewayUserSpendPage } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/fns/selectGatewayUserSpendPage";
import {
  type GatewayUserSpendRow,
  useGatewayUserSpend,
} from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayUserSpend";
import { GatewayUserSpendTable } from "./GatewayUserSpendTable";

type ConnectedGatewayUserSpendTableProps = Pick<
  ComponentProps<typeof GatewayUserSpendTable>,
  "onRowClick" | "selectedRowId"
> & {
  organizationId: string;
  fetchQuery: GatewayAnalyticsFetchQuery;
  timeRange: { from: Date; to: Date };
};

/** Paging and search state stay local, so they do not clash with the API keys table's URL state. */
export function ConnectedGatewayUserSpendTable({
  organizationId,
  fetchQuery,
  timeRange,
  onRowClick,
  selectedRowId,
}: ConnectedGatewayUserSpendTableProps) {
  const data = useGatewayUserSpend({ organizationId, fetchQuery, timeRange });
  const [searchQuery, setSearchQuery] = useState("");
  const [paginationState, setPaginationState] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const page =
    data.status === "success"
      ? selectGatewayUserSpendPage(data.data, {
          searchQuery,
          pageIndex: paginationState.pageIndex,
          pageSize: paginationState.pageSize,
        })
      : undefined;
  const pageData: AsyncTableData<GatewayUserSpendRow[]> = page
    ? { status: "success", data: page.rows }
    : data;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPaginationState((current) => ({ ...current, pageIndex: 0 }));
  };

  return (
    <GatewayUserSpendTable
      data={pageData}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      search={{ value: searchQuery, onChange: handleSearchChange }}
      pagination={{
        mode: "offset",
        totalCount: page?.totalCount ?? null,
        state: paginationState,
        onChange: setPaginationState,
      }}
    />
  );
}
