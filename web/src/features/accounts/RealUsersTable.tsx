import { DataTable } from "@/src/components/table/data-table";
import { accountTableColumns } from "@/src/features/accounts/table-definition";
import { api } from "@/src/utils/api";

export function RealUsersTable({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = api.accounts.getUsers.useQuery({
    projectId,
  });

  return (
    <DataTable
      tableName="accounts"
      columns={accountTableColumns}
      data={{
        data: data,
        isLoading: isLoading,
        isError: isError,
      }}
    />
  );
}
