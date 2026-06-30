import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { type EnrichedDatasetRunItem } from "@langfuse/shared/src/server";
import { type DatasetItemIOCell } from "@/src/features/datasets/components/DatasetIOCells";
import { DatasetRunItemsByItemTable } from "@/src/features/datasets/components/DatasetRunItemsByItemTable";
import { convertRunItemToItemsByItemUiTableRow } from "@/src/features/datasets/lib/convertRunItemDataToUiTableRow";
import { type DatasetRunItemByItemRowData } from "@/src/features/datasets/lib/types";

type DatasetItemIOCellProps = ComponentProps<typeof DatasetItemIOCell>;

const mocks = vi.hoisted(() => ({
  datasetItemIOCellCalls: [] as DatasetItemIOCellProps[],
  runItemsByItemIdUseQuery: vi.fn(),
}));

vi.mock("@/src/features/datasets/components/DatasetIOCells", () => ({
  DatasetItemIOCell: (props: (typeof mocks.datasetItemIOCellCalls)[number]) => {
    mocks.datasetItemIOCellCalls.push(props);
    return <div data-testid="dataset-item-io-cell">{props.datasetItemId}</div>;
  },
  TraceObservationIOCell: () => <div data-testid="trace-observation-io-cell" />,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      runItemsByItemId: {
        useQuery: (...args: unknown[]) =>
          mocks.runItemsByItemIdUseQuery(...args),
      },
    },
  },
}));

vi.mock("@/src/features/navigate-detail-pages/context", () => ({
  useDetailPageLists: () => ({ setDetailPageList: vi.fn() }),
}));

vi.mock("@/src/features/scores/hooks/useScoreColumns", () => ({
  useScoreColumns: () => ({ scoreColumns: [], isLoading: false }),
}));

vi.mock("@/src/features/column-visibility/hooks/useColumnVisibility", () => ({
  default: () => [{}, vi.fn()],
}));

vi.mock("@/src/features/column-visibility/hooks/useColumnOrder", () => ({
  default: () => [[], vi.fn()],
}));

vi.mock("@/src/components/table/data-table-row-height-switch", () => ({
  useRowHeightLocalStorage: () => ["m", vi.fn()],
}));

vi.mock("use-query-params", () => ({
  NumberParam: {},
  withDefault: (_param: unknown, defaultValue: unknown) => ({
    defaultValue,
  }),
  useQueryParams: (config: Record<string, { defaultValue: unknown }>) => [
    Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, value.defaultValue]),
    ),
    vi.fn(),
  ],
}));

vi.mock("@/src/components/table/data-table-toolbar", () => ({
  DataTableToolbar: () => null,
}));

vi.mock("@/src/components/table/data-table", () => ({
  DataTable: ({
    columns,
    data,
  }: {
    columns: ColumnDef<DatasetRunItemByItemRowData, unknown>[];
    data:
      | { isLoading: true }
      | { isError: true }
      | { data: DatasetRunItemByItemRowData[] };
  }) => {
    const rows = "data" in data ? data.data : [];
    const table = useReactTable({
      data: rows,
      columns,
      getCoreRowModel: getCoreRowModel(),
    });

    if ("isLoading" in data && data.isLoading) {
      return <div data-testid="table-loading" />;
    }
    if ("isError" in data && data.isError) {
      return <div data-testid="table-error" />;
    }
    if (!("data" in data)) {
      return null;
    }

    return (
      <div data-testid="dataset-run-items-table">
        {table.getRowModel().rows.map((row) =>
          row.getVisibleCells().map((cell) => (
            <div
              key={cell.id}
              data-testid={`cell-${cell.column.id}`}
              data-column-id={cell.column.id}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </div>
          )),
        )}
      </div>
    );
  },
}));

const projectId = "project-1";
const datasetId = "dataset-1";
const datasetItemId = "dataset-item-1";

const createRunItem = (overrides: {
  id: string;
  datasetRunName: string;
}): EnrichedDatasetRunItem => ({
  id: overrides.id,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  datasetRunName: overrides.datasetRunName,
  datasetItemId,
  datasetItemVersion: undefined,
  datasetRunId: `run-${overrides.id}`,
  trace: {
    id: `trace-${overrides.id}`,
    totalCost: 0.01,
    duration: 1.2,
  },
  observation: undefined,
  scores: {},
});

describe("DatasetRunItemsByItemTable", () => {
  beforeEach(() => {
    mocks.datasetItemIOCellCalls.length = 0;
    mocks.runItemsByItemIdUseQuery.mockReset();
  });

  it("renders expected output from page props even though row data has no datasetItemId column", () => {
    const runItems = [
      createRunItem({ id: "run-item-1", datasetRunName: "Run A" }),
      createRunItem({ id: "run-item-2", datasetRunName: "Run B" }),
    ];

    mocks.runItemsByItemIdUseQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      isSuccess: true,
      data: {
        runItems,
        totalRunItems: runItems.length,
      },
    });

    render(
      <DatasetRunItemsByItemTable
        projectId={projectId}
        datasetId={datasetId}
        datasetItemId={datasetItemId}
      />,
    );

    const expectedOutputCells = screen.getAllByTestId("dataset-item-io-cell");
    expect(expectedOutputCells).toHaveLength(2);
    expectedOutputCells.forEach((cell) => {
      expect(cell).toHaveTextContent(datasetItemId);
    });

    expect(mocks.datasetItemIOCellCalls).toEqual([
      expect.objectContaining({
        projectId,
        datasetId,
        datasetItemId,
        io: "expectedOutput",
      }),
      expect.objectContaining({
        projectId,
        datasetId,
        datasetItemId,
        io: "expectedOutput",
      }),
    ]);

    const rows = runItems.map(convertRunItemToItemsByItemUiTableRow);
    rows.forEach((row) => {
      expect(row).not.toHaveProperty("datasetItemId");
    });
  });

  it("passes page props to runItemsByItemId query", () => {
    mocks.runItemsByItemIdUseQuery.mockReturnValue({
      isLoading: true,
      isError: false,
      isSuccess: false,
    });

    render(
      <DatasetRunItemsByItemTable
        projectId={projectId}
        datasetId={datasetId}
        datasetItemId={datasetItemId}
      />,
    );

    expect(mocks.runItemsByItemIdUseQuery).toHaveBeenCalledWith({
      projectId,
      datasetId,
      datasetItemId,
      page: 0,
      limit: 20,
    });
    expect(screen.getByTestId("table-loading")).toBeInTheDocument();
  });
});
