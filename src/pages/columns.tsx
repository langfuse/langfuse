// import { type ColumnDef } from "@tanstack/react-table";
// import { lastCharacters } from "../utils/string";
// import router from "next/router";
// import { type TraceTableRow } from "./traces";
// import "@tanstack/react-table";

// export const columns: ColumnDef<TraceTableRow>[] = [
//   {
//     accessorKey: "id",
//     cell: ({ row }) => {
//       return (
//         <div>
//           <button
//             key="openTrace"
//             className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-blue-600 shadow-sm hover:bg-indigo-100"
//             onClick={() => void router.push(`/traces/${row.getValue("id")}`)}
//           >
//             ...{lastCharacters(row.getValue("id"), 7)}
//           </button>
//         </div>
//       );
//     },
//     enableColumnFilter: true,
//     meta: {
//       label: "Id",
//       updateFunction: (newIds: string[] | null) => {
//         updateQueryOptions({ ...queryOptions, ids: newIds });
//       };
//     },
//   },
//   {
//     accessorKey: "timestamp",
//     header: "Timestamp",
//   },
//   {
//     accessorKey: "name",
//     header: "Name",
//     enableColumnFilter: true,
//     meta: {
//       label: "Name",
//     },
//   },
//   {
//     accessorKey: "status",
//     header: "Status",
//     enableColumnFilter: true,
//     meta: {
//       label: "Status",
//     },
//   },
//   {
//     accessorKey: "statusMessage",
//     header: "Status Message",
//   },
//   {
//     accessorKey: "attributes",
//     header: "Attributes",
//   },
//   {
//     accessorKey: "scores",
//     header: "Scores",
//   },
// ];
