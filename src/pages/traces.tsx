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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { type RouterOutput } from "../utils/types";
import { Button } from "../components/ui/button";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ObservationDisplay from "../components/observationDisplay";

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
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Table</TabsTrigger>
          <TabsTrigger value="sidebyside">Side-by-side</TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          <DataGrid
            rows={rows}
            columns={columns}
            slots={{ toolbar: GridToolbar }}
            loading={traces.isLoading}
            autoHeight
          />
        </TabsContent>
        <TabsContent value="sidebyside">
          <div className="relative flex max-w-full flex-row gap-2 overflow-x-scroll pb-3">
            {traces.data?.map((trace) => (
              <Single key={trace.id} trace={trace} />
            ))}
            {traces.data?.map((trace) => (
              <Single key={trace.id} trace={trace} />
            ))}
            {traces.data?.map((trace) => (
              <Single key={trace.id} trace={trace} />
            ))}
            {traces.data?.map((trace) => (
              <Single key={trace.id} trace={trace} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}

const Single = (props: { trace: RouterOutput["traces"]["all"][number] }) => {
  const { trace } = props;

  if (trace.nestedObservation)
    return (
      <div className="w-[550px] flex-none rounded-md border px-3">
        <div className="mt-4 font-bold">Trace</div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/traces/${trace.id}`}>
            {trace.id}
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <div className="mt-4 text-sm font-bold">Timestamp</div>
        <div>{trace.timestamp.toLocaleString()}</div>
        <div className="mt-4 text-sm font-bold">Name</div>
        <div>{trace.name}</div>
        <div className="mt-4 text-sm font-bold">Observations:</div>
        <ObservationDisplay key={trace.id} obs={trace.nestedObservation} />
      </div>
    );
  else return null;
};
