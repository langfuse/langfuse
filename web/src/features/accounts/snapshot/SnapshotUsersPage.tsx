import { DataTable } from "@/src/components/table/data-table";
import { snapshotTableColumns } from "@/src/features/accounts/snapshot/table-definition";
import { api } from "@/src/utils/api";

interface SnapshotUsersPageProps {
  projectId: string;
}

export function SnapshotUsersPage({ projectId }: SnapshotUsersPageProps) {
  const { data, isLoading, isError } = api.accounts.getSnapshotUsers.useQuery({
    projectId,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-blue-50 p-4 dark:bg-blue-950">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Snapshot Users
            </h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
              <p>
                Snapshot users are automatically created from message views and
                cannot be manually created or edited. They are read-only and
                contain metadata from the original conversation context.
              </p>
            </div>
          </div>
        </div>
      </div>
      <DataTable
        tableName="snapshot-accounts"
        columns={snapshotTableColumns}
        data={{
          data: data,
          isLoading: isLoading,
          isError: isError,
        }}
      />
    </div>
  );
}
