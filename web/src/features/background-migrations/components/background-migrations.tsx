import { SupportChannels } from "@/src/components/Support";
import Header from "@/src/components/layouts/header";
import { ScrollScreenPage } from "@/src/components/layouts/scroll-screen-page";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { api } from "@/src/utils/api";
import { type BackgroundMigration } from "@langfuse/shared";

// type BackgroundMigrationsRow = {
//   name: string;
//   script: string;
//   args: Prisma.JsonValue;
//   finishedAt: Date | null;
//   failedAt: Date | null;
//   failedReason: string | null;
//   state: Prisma.JsonValue;
// };

export default function BackgroundMigrationsTable() {
  const backgroundMigrations = api.backgroundMigrations.all.useQuery();

  const columns: LangfuseColumnDef<BackgroundMigration>[] = [
    {
      accessorKey: "name",
      id: "name",
      enableColumnFilter: false,
      header: "Name",
    },
    {
      accessorKey: "script",
      id: "script",
      enableColumnFilter: false,
      header: "Script",
    },
    {
      accessorKey: "args",
      id: "args",
      enableColumnFilter: false,
      header: "Args",
      cell: (row) => JSON.stringify(row.getValue()),
    },
    {
      accessorKey: "finishedAt",
      id: "finishedAt",
      enableColumnFilter: false,
      header: "Finished At",
    },
    {
      accessorKey: "failedAt",
      id: "failedAt",
      enableColumnFilter: false,
      header: "Failed At",
    },
    {
      accessorKey: "failedReason",
      id: "failedReason",
      enableColumnFilter: false,
      header: "Failed Reason",
    },
    {
      accessorKey: "state",
      id: "state",
      enableColumnFilter: false,
      header: "State",
      cell: (row) => JSON.stringify(row.getValue()),
    },
  ];

  return (
    <>
      <DataTableToolbar
        columns={columns}
        // columnVisibility={columnVisibility}
        // setColumnVisibility={setColumnVisibility}
        // columnOrder={columnOrder}
        // setColumnOrder={setColumnOrder}
        // rowHeight={rowHeight}
        // setRowHeight={setRowHeight}
      />
      <DataTable
        columns={columns}
        data={
          backgroundMigrations.isLoading
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
                  data: backgroundMigrations.data.migrations,
                }
        }
        // pagination={{
        //   totalCount,
        //   onChange: setPaginationState,
        //   state: paginationState,
        // }}
        // columnVisibility={columnVisibility}
        // onColumnVisibilityChange={setColumnVisibility}
        // columnOrder={columnOrder}
        // onColumnOrderChange={setColumnOrder}
        // rowHeight={rowHeight}
      />
    </>
  );
}
