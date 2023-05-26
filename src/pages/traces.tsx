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

interface TraceRowData {
  id: string;
}

export default function Traces() {
  const traces = api.traces.all.useQuery(undefined, { refetchInterval: 1000 });
  const router = useRouter();

  const columns: GridColDef[] = [
    {
      field: "id",
      type: "actions",
      headerName: "ID",
      width: 100,
      getActions: (params: GridRowParams<TraceRowData>) => [
        <button
          key="openTrace"
          className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100"
          onClick={() => void router.push(`/traces/${params.row.id}`)}
        >
          ...{lastCharacters(params.row.id, 7)}
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
      field: "scores",
      headerName: "Scores",
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
        scores: trace.scores
          .map((score) => `${score.name}: ${score.value}`)
          .join("; "),
      }))
    : [];

  return (
    <>
      <Header title="Traces" live />
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
