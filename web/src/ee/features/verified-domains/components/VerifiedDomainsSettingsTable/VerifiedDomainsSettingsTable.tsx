import { useMemo } from "react";
import { TrashIcon } from "lucide-react";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createButtonTableColumn } from "@/src/components/design-system/table/columns/createButtonTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import {
  type AsyncTableData,
  type TableProps,
} from "@/src/components/design-system/table/Table";

export type DomainRowData = {
  id: string;
  domain: string;
  verifiedAt: Date | null;
  createdAt: Date;
  recordHost: string;
  recordValue: string;
};

export function VerifiedDomainsSettingsTable({
  data,
  verifyingDomainId,
  onDelete,
  onViewInstructions,
}: {
  data: AsyncTableData<DomainRowData[]>;
  verifyingDomainId: string | null;
  onDelete: (row: DomainRowData) => void;
  onViewInstructions: (row: DomainRowData) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<DomainRowData>[]>(
    () => [
      createTextTableColumn<DomainRowData>({
        accessorKey: "domain",
        header: "Domain",
        enableResizing: false,
      }),
      createBadgeTableColumn<DomainRowData>({
        accessorFn: (row) =>
          row.verifiedAt ? "Verified" : "Pending verification",
        id: "status",
        header: "Status",
        enableResizing: false,
        range: "semantic",
        getBadge: (value) => ({
          value,
          variant: value === "Verified" ? "success" : "warning",
        }),
      }),
      createDateTableColumn<DomainRowData>({
        accessorKey: "createdAt",
        header: "Added",
        hideBelowMd: true,
        enableResizing: false,
      }),
      createButtonTableColumn<DomainRowData, string>({
        accessorFn: (row) => row.id,
        id: "verify",
        header: "",
        getButton: ({ row }) => ({
          text: "Verify",
          onClick: () => onViewInstructions(row.original),
          loading: verifyingDomainId === row.original.id,
          disabled: Boolean(row.original.verifiedAt),
        }),
      }),
    ],
    [onViewInstructions, verifyingDomainId],
  );

  const actions: NonNullable<TableProps<DomainRowData>["actions"]> = (row) => [
    {
      id: "delete",
      type: "item",
      title: "Delete",
      icon: TrashIcon,
      variant: "destructive",
      onClick: () => onDelete(row),
    },
  ];

  return (
    <SettingsTable
      tableName="Verified domains"
      columns={columns}
      actions={actions}
      data={data}
      noResultsMessage="No domains added yet"
    />
  );
}
