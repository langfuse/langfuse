import Page from "@/src/components/layouts/page";
import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { conversationTableColumns } from "@/src/features/conversations/table-definition";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { withDefault } from "use-query-params";
import { NumberParam, StringParam, useQueryParams } from "use-query-params";

export function ConversationsPage() {
  const router = useRouter();

  const projectId = router.query.projectId as string;

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [queryParams] = useQueryParams({
    accountId: StringParam,
  });

  const [rowHeight] = useRowHeightLocalStorage("sessions", "s");

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const payloadCount = {
    projectId,
    accountId: queryParams.accountId || undefined,
    orderBy: null,
    page: 0,
    limit: 1,
  };

  const payloadGetAll = {
    ...payloadCount,
    orderBy: orderByState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  };

  const sessions = api.conversations.all.useQuery(payloadGetAll);

  const sessionCountQuery = api.sessions.countAll.useQuery({
    projectId,
    filter: [],
    orderBy: null,
    page: 0,
    limit: 1,
  });

  const totalCount = sessionCountQuery.data?.totalCount ?? null;

  return (
    <Page
      headerProps={{
        title: "Conversations",
        breadcrumb: [
          {
            name: "Conversations",
            href: `/project/${projectId}/conversations`,
          },
        ],
      }}
    >
      <DataTable
        columns={conversationTableColumns}
        onRowClick={(row) => {
          router.push(`/project/${projectId}/conversations/${row.id}`);
        }}
        data={
          sessions.isLoading
            ? { isLoading: true, isError: false }
            : sessions.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: sessions.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: sessions.data.sessions,
                }
        }
        pagination={{
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        setOrderBy={setOrderByState}
        orderBy={orderByState}
        rowHeight={rowHeight}
      />
    </Page>
  );
}
