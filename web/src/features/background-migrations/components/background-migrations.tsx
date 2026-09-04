import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { type BackgroundMigration } from "@langfuse/shared";
import { RetryBackgroundMigrationPopoverController } from "@/src/features/background-migrations/components/retry-background-migration";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { RotateCcw } from "lucide-react";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";

export default function BackgroundMigrationsTable() {
  const backgroundMigrations = api.backgroundMigrations.all.useQuery();

  const columns = [
    createTextTableColumn<BackgroundMigration>({
      accessorKey: "name",
      enableColumnFilter: false,
      header: "Name",
    }),
    createTextTableColumn<BackgroundMigration>({
      accessorKey: "script",
      enableColumnFilter: false,
      header: "Script",
    }),
    {
      accessorKey: "args",
      id: "args",
      enableColumnFilter: false,
      header: "Args",
      size: 80,
      cell: (row) => JSON.stringify(row.getValue()),
    },
    createStatusTableColumn<BackgroundMigration, BackgroundMigration>({
      id: "status",
      accessorFn: (row) => row,
      getStatus: (migration) => {
        if (!migration) return undefined;
        if (migration.failedAt) return "failed";
        if (migration.finishedAt) return "finished";
        if (migration.workerId) return "active";

        return "queued";
      },
      header: "Status",
      size: 80,
      enableSorting: false,
    }),
    createTextTableColumn<BackgroundMigration>({
      accessorKey: "failedReason",
      enableColumnFilter: false,
      header: "Failed Reason",
    }),
    createTextTableColumn<BackgroundMigration, BackgroundMigration["state"]>({
      accessorKey: "state",
      enableColumnFilter: false,
      header: "State",
      mapValue: (value) => JSON.stringify(value),
    }),
    {
      id: "actions",
      header: "Actions",
      size: 65,
      cell: (row) => {
        const name = row.row.original.name;
        const isRetryable = row.row.original.failedAt !== null;
        return (
          <RetryBackgroundMigrationPopoverController
            backgroundMigrationName={name}
            isRetryable={isRetryable}
          >
            {({ disabled, Trigger }) => (
              <Trigger asChild>
                <Button variant="ghost" size="xs" disabled={disabled}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </Trigger>
            )}
          </RetryBackgroundMigrationPopoverController>
        );
      },
    },
  ] as LangfuseColumnDef<BackgroundMigration>[];

  return (
    <Page
      headerProps={{
        title: "Background Migrations",
      }}
    >
      <DataTableToolbar columns={columns} />
      <DataTable
        tableName="backgroundMigrations"
        columns={columns}
        data={
          backgroundMigrations.isPending
            ? { isLoading: true, isError: false }
            : backgroundMigrations.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: backgroundMigrations.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: backgroundMigrations.data?.migrations ?? [],
                }
        }
      />
    </Page>
  );
}
