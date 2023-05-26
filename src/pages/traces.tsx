import Header from "~/components/layouts/header";

import {
  DataGrid,
  type GridRowsProp,
  type GridColDef,
  type GridRowParams,
  type GridFilterItem,
  type GridFilterOperator,
  type GridFilterInputValueProps,
  SUBMIT_FILTER_STROKE_TIME,
  type GridFilterModel,
  GridToolbarContainer,
  GridToolbarExport,
  GridToolbarFilterButton,
  GridCell,
  type GridCellProps,
  GridRow,
} from "@mui/x-data-grid";
import { api } from "~/utils/api";
import { useRouter } from "next/router";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { type RouterInput, type RouterOutput } from "../utils/types";
import { Button } from "../components/ui/button";
import Link from "next/link";
import { ArrowUpRight, Copy } from "lucide-react";
import ObservationDisplay from "../components/observationDisplay";
import { type TextFieldProps, TextField, Box } from "@mui/material";
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

function InputKeyValue(props: GridFilterInputValueProps) {
  const { item, applyValue, focusElementRef = null } = props;

  const filterTimeout = React.useRef<any>();
  const [filterValueState, setFilterValueState] = React.useState<
    [string, string]
  >(item.value ?? "");

  const [applying, setIsApplying] = React.useState(false);

  React.useEffect(() => {
    return () => {
      clearTimeout(filterTimeout.current);
    };
  }, []);

  React.useEffect(() => {
    const itemValue = item.value ?? [undefined, undefined];
    setFilterValueState(itemValue);
  }, [item.value]);

  const updateFilterValue = (key: string, value: string) => {
    clearTimeout(filterTimeout.current);
    setFilterValueState([key, value]);

    setIsApplying(true);
    filterTimeout.current = setTimeout(() => {
      setIsApplying(false);
      applyValue({ ...item, value: [key, value] });
    }, SUBMIT_FILTER_STROKE_TIME);
  };

  const handleUpperFilterChange: TextFieldProps["onChange"] = (event) => {
    const newUpperBound = event.target.value;
    updateFilterValue(filterValueState[0], newUpperBound);
  };
  const handleLowerFilterChange: TextFieldProps["onChange"] = (event) => {
    const newLowerBound = event.target.value;
    updateFilterValue(newLowerBound, filterValueState[1]);
  };

  return (
    <Box
      sx={{
        display: "inline-flex",
        flexDirection: "row",
        alignItems: "end",
        height: 48,
        pl: "20px",
      }}
    >
      <TextField
        name="lower-bound-input"
        placeholder="Key"
        label="key"
        variant="standard"
        value={String(filterValueState[0])}
        onChange={handleLowerFilterChange}
        type="string"
        inputRef={focusElementRef}
        sx={{ mr: 2 }}
      />
      <TextField
        name="upper-bound-input"
        placeholder="Value"
        label="value"
        variant="standard"
        value={String(filterValueState[1])}
        onChange={handleUpperFilterChange}
        type="string"
        InputProps={
          applying
            ? {
                endAdornment: <FontAwesomeIcon icon={faSpinner} />,
              }
            : {}
        }
      />
    </Box>
  );
}

interface TraceRowData {
  id: string;
}

type TraceFilterInput = RouterInput["traces"]["all"];

export default function Traces() {
  const [queryOptions, setQueryOptions] = React.useState<TraceFilterInput>({
    attributes: {},
  });

  const traces = api.traces.all.useQuery(queryOptions, {
    refetchInterval: 2000,
  });
  const router = useRouter();

  const quantityOnlyOperators: GridFilterOperator[] = [
    {
      label: "Key-Value",
      value: "key-value",
      getApplyFilterFn: (filterItem: GridFilterItem) => {
        if (!Array.isArray(filterItem.value) || filterItem.value.length !== 2) {
          return null;
        }
        if (filterItem.value[0] == null || filterItem.value[1] == null) {
          return null;
        }

        return ({ value }) => {
          const jsonObj = JSON.parse(value);

          return (
            value !== null &&
            jsonObj[filterItem.value[0]] !== undefined &&
            jsonObj[filterItem.value[0]] === filterItem.value[1]
          );
        };
      },
      InputComponent: InputKeyValue,
    },
  ];

  const [filterModel, setFilterModel] = React.useState<GridFilterModel>({
    items: [
      {
        id: 1,
        field: "attributes",
        value: ["id", "abcd"],
        operator: "key-value",
      },
    ],
  });

  const columns: GridColDef[] = [
    {
      field: "id",
      headerClassName: "super-app-theme--header",
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
      hideable: false,
      type: "dateTime",
      headerName: "Timestamp",
      width: 170,
    },
    { field: "name", hideable: false, headerName: "Name", minWidth: 200 },
    { field: "status", hideable: false, headerName: "Status", minWidth: 100 },
    {
      field: "statusMessage",
      hideable: false,
      headerName: "Status Message",
      width: 200,
    },
    {
      field: "attributes",
      hideable: false,
      headerName: "Attributes",
      flex: 1,
      filterOperators: quantityOnlyOperators,
    },
    {
      field: "scores",
      hideable: false,
      headerName: "Scores",
      flex: 1,
    },
  ];

  const onFilterChange = React.useCallback((filterModel: GridFilterModel) => {
    console.log("hello", filterModel);

    let filterOptions: TraceFilterInput = { attributes: {} };

    filterModel.items.forEach((item) => {
      if (item.operator === "key-value") {
        if (!Array.isArray(item.value) || item.value.length !== 2) {
          return null;
        }
        if (item.value[0] == null || item.value[1] == null) {
          return null;
        }

        filterOptions = {
          attributes: {
            path: [item.value[0]],
            equals: item.value[1] as string,
          },
        };
      }
      console.log("filterOptions", filterOptions);
      setFilterModel(filterModel);
    });

    setQueryOptions(filterOptions);
  }, []);

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
            loading={traces.isLoading}
            filterModel={filterModel}
            filterMode="server"
            onFilterModelChange={onFilterChange}
            slots={{
              row: Single,
              toolbar: CustomToolbar,
            }}
            // slotProps={{
            //   row: { trace: traces.data },
            // }}
            autoHeight
          />
        </TabsContent>
        <TabsContent value="sidebyside">
          <div className="relative flex max-w-full flex-row gap-2 overflow-x-scroll pb-3">
            {traces.data?.map((trace) => (
              <Single key={trace.id} trace={trace} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

const CustomRow = (props: GridRowsProp) => {
  return <GridRow {...other}></GridRow>;
};

function CustomToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarFilterButton />
      <GridToolbarExport />
    </GridToolbarContainer>
  );
}

function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}

const Single = (props: { trace: RouterOutput["traces"]["all"][number] }) => {
  const { trace } = props;

  console.log(props);

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
