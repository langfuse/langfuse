import { type ColumnDef } from "@tanstack/react-table";
import { lastCharacters } from "../utils/string";
import router from "next/router";
import { type TraceTableRow } from "./traces";

export const columns: ColumnDef<TraceTableRow>[] = [
  {
    accessorKey: "id",
    cell: ({ row }) => {
      return (
        <div>
          <button
            key="openTrace"
            className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100"
            onClick={() => void router.push(`/traces/${row.getValue("id")}`)}
          >
            ...{lastCharacters(row.getValue("id"), 7)}
          </button>
        </div>
      );
    },
  },
  {
    accessorKey: "timestamp",
    header: "Timestamp",
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "status",
    header: "Status",
  },
  {
    accessorKey: "statusMessage",
    header: "Status Message",
  },
  {
    accessorKey: "attributes",
    header: "Attributes",
  },
  {
    accessorKey: "scores",
    header: "Scores",
  },
];
