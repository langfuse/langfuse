import Header from "~/components/layouts/header";

import {
  DataGrid,
  type GridRowsProp,
  type GridColDef,
  type GridRowParams,
  GridToolbar,
} from "@mui/x-data-grid";
import { api } from "~/utils/api";
import { useRouter } from "next/router";

// const rows: GridRowsProp = [
//   { id: 1, col1: "Hello", col2: "World" },
//   { id: 2, col1: "DataGridPro", col2: "is Awesome" },
//   { id: 3, col1: "MUI", col2: "is Amazing" },
// ];

export default function Traces() {
  const traces = api.traces.all.useQuery();
  const router = useRouter();

  const columns: GridColDef[] = [
    {
      field: "id",
      type: "actions",
      headerName: "ID",
      width: 100,
      getActions: (params: GridRowParams) => [
        <button
          key="openTrace"
          className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100"
          onClick={() => void router.push(`/traces/${params.row.id as string}`)}
        >
          ...{lastCharacters(params.row.id as string, 7)}
        </button>,
      ],
    },
    {
      field: "timestamp",
      type: "dateTime",
      headerName: "Timestamp",
      width: 170,
    },
    { field: "name", headerName: "Name", minWidth: 200 },
    { field: "status", headerName: "Status", minWidth: 100 },
    {
      field: "statusMessage",
      headerName: "Status Message",
      width: 200,
    },
    {
      field: "attributes",
      headerName: "Attributes",
      flex: 1,
    },
    {
      field: "metrics",
      headerName: "Metrics",
      flex: 1,
    },
  ];

  const rows: GridRowsProp = traces.isSuccess
    ? traces.data.map((trace) => ({
        id: trace.id,
        timestamp: trace.timestamp,
        name: trace.name,
        status: trace.status,
        statusMessage: trace.statusMessage,
        attributes: JSON.stringify(trace.attributes),
        metrics: trace.metrics
          .map((metric) => `${metric.name}: ${metric.value}`)
          .join("; "),
      }))
    : [];

  return (
    <>
      <Header title="Traces" />
      <DataGrid
        rows={rows}
        columns={columns}
        slots={{ toolbar: GridToolbar }}
        loading={traces.isLoading}
      />
    </>
  );
}

function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}
