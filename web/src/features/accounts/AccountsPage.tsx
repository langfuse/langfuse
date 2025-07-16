import {
  accountTableColumns,
  AccountTableMeta,
} from "@/src/features/accounts/table-definition";
import { DataTable } from "@/src/components/table/data-table";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export function AccountsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { data, isLoading, isError } = api.accounts.getUsers.useQuery({
    projectId,
  });

  return (
    <Page
      headerProps={{
        title: "Accounts",
        breadcrumb: [
          { name: "Accounts", href: `/project/${projectId}/accounts` },
        ],
      }}
    >
      <DataTable
        columns={accountTableColumns}
        data={{
          data: data,
          isLoading: isLoading,
          isError: isError,
        }}
      />
    </Page>
  );
}
