import { render, screen } from "@testing-library/react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DataTable } from "./data-table";
import {
  DataTableSkeletonLoadingRows,
  type DataTableLoadingRowsProps,
} from "./data-table-loading-rows";

jest.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
  }),
}));

jest.mock("../../features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => jest.fn(),
}));

jest.mock("../ui/CodeJsonViewer", () => ({
  JsonSkeleton: ({ numRows = 10 }: { numRows?: number }) => (
    <div>
      {Array.from({ length: numRows }).map((_, i) => (
        <div className="h-4 w-full animate-pulse" key={i} />
      ))}
    </div>
  ),
}));

type TestRow = {
  id: string;
  name: string;
  status: string;
};

type TestIoRow = {
  id: string;
  input: string;
  status: string;
};

const columns: LangfuseColumnDef<TestRow, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => row.original.status,
  },
];

const ioColumns: LangfuseColumnDef<TestIoRow, unknown>[] = [
  {
    accessorKey: "input",
    id: "input",
    header: "Input",
    cell: ({ row }) => row.original.input,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => row.original.status,
  },
];

describe("DataTable loading states", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders default loading state when no loadingRowsComponent is provided", () => {
    render(
      <DataTable
        tableName="test-table-default-loading"
        columns={columns}
        data={{ isLoading: true, isError: false }}
      />,
    );

    expect(screen.getByText("Loading...")).not.toBeNull();
  });

  it("renders custom loading state when loadingRowsComponent is provided", () => {
    const customLoadingRowsSpy = jest.fn();
    const CustomLoadingRows = ({
      columns,
    }: DataTableLoadingRowsProps<TestRow>) => {
      customLoadingRowsSpy();
      return (
        <tr data-testid="custom-loading-row">
          <td colSpan={columns.length}>Custom loading</td>
        </tr>
      );
    };

    render(
      <DataTable
        tableName="test-table-custom-loading"
        columns={columns}
        data={{ isLoading: true, isError: false }}
        loadingRowsComponent={CustomLoadingRows}
      />,
    );

    expect(screen.getByTestId("custom-loading-row")).not.toBeNull();
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(customLoadingRowsSpy).toHaveBeenCalled();
  });

  it("renders 10 skeleton rows with one skeleton per column when using DataTableSkeletonLoadingRows", () => {
    const TenRowLoadingRows = (props: DataTableLoadingRowsProps<TestRow>) => (
      <DataTableSkeletonLoadingRows {...props} rowCount={10} />
    );

    const { container } = render(
      <DataTable
        tableName="test-table-skeleton-loading"
        columns={columns}
        data={{ isLoading: true, isError: false }}
        loadingRowsComponent={TenRowLoadingRows}
      />,
    );

    const loadingRows = container.querySelectorAll("tbody tr");
    const loadingCells = container.querySelectorAll("tbody .animate-pulse");

    expect(loadingRows).toHaveLength(10);
    expect(loadingCells).toHaveLength(20);
  });

  it("renders multiline loading skeleton for input column in shared loading rows", () => {
    const OneRowLoadingRows = (props: DataTableLoadingRowsProps<TestIoRow>) => (
      <DataTableSkeletonLoadingRows {...props} rowCount={1} />
    );

    const { container } = render(
      <DataTable
        tableName="test-table-io-skeleton-loading"
        columns={ioColumns}
        data={{ isLoading: true, isError: false }}
        loadingRowsComponent={OneRowLoadingRows}
      />,
    );

    const loadingCells = container.querySelectorAll("tbody .animate-pulse");

    expect(loadingCells).toHaveLength(11);
  });
});
