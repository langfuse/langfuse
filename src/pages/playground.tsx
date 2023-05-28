import React from "react";
import Header from "../components/layouts/header";
import { api } from "../utils/api";
import { type RouterInput } from "../utils/types";
import {
  createColumnHelper,
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { lastCharacters } from "../utils/string";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";

export default function Playground() {
  type TraceFilterInput = RouterInput["traces"]["all"];

  const router = useRouter();

  const [queryOptions, setQueryOptions] = React.useState<TraceFilterInput>({
    attributes: {},
  });

  const traces = api.traces.all.useQuery(queryOptions, {
    refetchInterval: 2000,
  });

  type TraceRow = {
    id: string;
    timestamp: Date;
    name: string;
    status: string;
    statusMessage?: string;
    traceAttributes?: string;
    scores: string;
  };

  const columnHelper = createColumnHelper<TraceRow>();

  const table = useReactTable({
    columns: [
      columnHelper.accessor((row) => row.id, {
        cell: (info) => {
          return (
            <button
              key="openTrace"
              className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100"
              onClick={() => void router.push(`/traces/${info.getValue()}`)}
            >
              ...{lastCharacters(info.getValue(), 7)}
            </button>
          );
        },
        header: () => "id",
        id: "id",
      }),
      // Accessor Column
      columnHelper.accessor((row) => row.timestamp.toISOString(), {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        cell: (info) => info.getValue(),
        header: () => "timestamp",
        id: "timestamp",
      }),
      columnHelper.accessor((row) => row.name, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        cell: (info) => info.getValue(),
        header: () => {
          return (
            <div className="group inline-flex">
              Name
              <span className="ml-2 flex-none rounded text-gray-900 group-hover:bg-gray-200">
                <FontAwesomeIcon
                  className="h-3 w-3"
                  aria-hidden="true"
                  icon={faFilter}
                />
              </span>
            </div>
          );
        },
        id: "name",
      }),
      columnHelper.accessor((row) => row.status, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        cell: (info) => info.getValue(),
        header: () => "Status",
        id: "status",
      }),
      columnHelper.accessor((row) => row.statusMessage, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        cell: (info) => info.getValue(),
        header: () => "Status Message",
        id: "status-message",
      }),
      columnHelper.accessor((row) => row.traceAttributes, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        cell: (info) => info.getValue(),
        header: () => "Attributes",
        id: "attributes",
      }),
      columnHelper.accessor((row) => row.scores, {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        cell: (info) => info.getValue(),
        header: () => "Scores",
        id: "scores",
      }),
    ],
    data: traces.isLoading
      ? []
      : traces.data?.map((trace) => {
          return {
            id: trace.id,
            timestamp: trace.timestamp,
            name: trace.name,
            status: trace.status,
            statusMessage: trace.statusMessage ?? undefined,
            traceAttributes: JSON.stringify(trace.attributes),
            scores: trace.scores
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access
              .map((score) => `${score.name}: ${score.value}`)
              .join("; "),
          };
        }) || [],
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mt-8 flow-root">
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="bg-gray-50">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {traces.isLoading || !traces.data ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex h-[150px] flex-col items-center justify-center text-sm font-light uppercase text-neutral-500">
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : traces.data.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex h-[150px] flex-col items-center justify-center text-sm font-light uppercase text-neutral-500">
                        No markets to show
                      </div>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell, i) => (
                        <td
                          key={cell.id}
                          className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
