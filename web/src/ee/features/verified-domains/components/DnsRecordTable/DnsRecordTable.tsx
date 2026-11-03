import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";

export function DnsRecordTable({
  recordHost,
  recordValue,
}: {
  recordHost: string;
  recordValue: string;
}) {
  const columns: LangfuseColumnDef<{
    type: string;
    host: string;
    value: string;
  }>[] = [
    createTextTableColumn({
      accessorKey: "type",
      header: "Type",
      size: 64,
      enableResizing: false,
    }),
    createTextTableColumn({
      accessorKey: "host",
      header: "Host",
      size: 216,
      enableResizing: false,
      trailingAction: { type: "copy-to-clipboard" },
    }),
    createTextTableColumn({
      accessorKey: "value",
      header: "Value",
      enableResizing: false,
      trailingAction: { type: "copy-to-clipboard" },
    }),
  ];
  return (
    <SettingsTable
      tableName="DNS record"
      columns={columns}
      data={{
        status: "success",
        data: [{ type: "TXT", host: recordHost, value: recordValue }],
      }}
    />
  );
}
