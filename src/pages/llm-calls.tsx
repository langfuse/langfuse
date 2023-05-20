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

export default function Traces() {
  const llmCalls = api.llmCalls.all.useQuery();
  const router = useRouter();

  const columns: GridColDef[] = [
    {
      field: "id",
      type: "actions",
      headerName: "ID",
      width: 100,
      getActions: (params: GridRowParams) => [
        <button
          key="openLlmCall"
          className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100"
          onClick={() =>
            void router.push(`/llm-calls/${params.row.id as string}`)
          }
        >
          ...{lastCharacters(params.row.id as string, 7)}
        </button>,
      ],
    },
    {
      field: "traceId",
      type: "actions",
      headerName: "Trace",
      width: 100,
      getActions: (params: GridRowParams) => [
        <button
          key="openTrace"
          className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-100"
          onClick={() =>
            void router.push(`/traces/${params.row.traceId as string}`)
          }
        >
          ...{lastCharacters(params.row.traceId as string, 7)}
        </button>,
      ],
    },
    {
      field: "startTime",
      type: "dateTime",
      headerName: "Start time",
      width: 170,
    },
    { field: "name", headerName: "Name", minWidth: 200 },
    {
      field: "prompt",
      headerName: "Prompt",
      flex: 1,
    },
    {
      field: "completion",
      headerName: "Completion",
      flex: 1,
    },
    {
      field: "model",
      headerName: "Model",
      flex: 1,
    },
  ];

  const rows: GridRowsProp = llmCalls.isSuccess
    ? llmCalls.data.map((llmCall) => ({
        id: llmCall.id,
        traceId: llmCall.traceId,
        startTime: llmCall.startTime,
        name: llmCall.name,
        prompt: llmCall.attributes.prompt,
        completion: llmCall.attributes.completion,
        model: JSON.stringify(llmCall.attributes.model),
      }))
    : [];

  return (
    <>
      <Header title="LLM Calls" />
      <DataGrid
        rows={rows}
        columns={columns}
        slots={{ toolbar: GridToolbar }}
        loading={llmCalls.isLoading}
      />
    </>
  );
}

function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}
