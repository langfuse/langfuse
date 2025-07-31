import { DataTable } from "@/src/components/table/data-table";
import { syntheticTableColumns } from "@/src/features/accounts/synthetic/table-definition";
import { api } from "@/src/utils/api";

interface SyntheticUsersPageProps {
  projectId: string;
}

export function SyntheticUsersPage({ projectId }: SyntheticUsersPageProps) {
  const { data, isLoading, isError } = api.accounts.getSyntheticUsers.useQuery({
    projectId,
  });

  return (
    <DataTable
      tableName="synthetic-accounts"
      columns={syntheticTableColumns}
      data={{
        data: data,
        isLoading: isLoading,
        isError: isError,
      }}
    />
  );
}
