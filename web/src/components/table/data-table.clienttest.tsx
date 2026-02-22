import { render, screen } from "@testing-library/react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  DataTable,
  DataTableSkeletonLoadingRows,
  type DataTableLoadingRowsProps,
} from "./data-table";

jest.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
  }),
}));

jest.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => jest.fn(),
}));

type TestRow = {
  id: string;
  name: string;
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

    expect(screen.getByText("Loading...")).toBeInTheDocument();
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

    expect(screen.getByTestId("custom-loading-row")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
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

  it("supports custom skeleton rendering for specific columns", () => {
    type IORow = {
      id: string;
      input: string;
      status: string;
    };

    const ioColumns: LangfuseColumnDef<IORow, unknown>[] = [
      {
        accessorKey: "input",
        header: "Input",
        cell: ({ row }) => row.original.input,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
    ];

    const IOLoadingRows = (props: DataTableLoadingRowsProps<IORow>) => (
      <DataTableSkeletonLoadingRows
        {...props}
        rowCount={2}
        renderSkeletonCell={({ column }) =>
          column.id === "input" ? (
            <div data-testid="io-column-custom-skeleton" />
          ) : undefined
        }
      />
    );

    const { container } = render(
      <DataTable
        tableName="test-table-custom-cell-skeleton"
        columns={ioColumns}
        data={{ isLoading: true, isError: false }}
        loadingRowsComponent={IOLoadingRows}
      />,
    );

    expect(screen.getAllByTestId("io-column-custom-skeleton")).toHaveLength(2);
    expect(container.querySelectorAll("tbody .animate-pulse")).toHaveLength(2);
  });

  it('passes "s" row height to custom skeleton renderer for fallback behavior', () => {
    type IORow = {
      id: string;
      input: string;
      status: string;
    };

    const ioColumns: LangfuseColumnDef<IORow, unknown>[] = [
      {
        accessorKey: "input",
        header: "Input",
        cell: ({ row }) => row.original.input,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => row.original.status,
      },
    ];

    const IOLoadingRows = (props: DataTableLoadingRowsProps<IORow>) => (
      <DataTableSkeletonLoadingRows
        {...props}
        rowCount={2}
        renderSkeletonCell={({ column, isSmallRowHeight }) =>
          !isSmallRowHeight && column.id === "input" ? (
            <div data-testid="io-column-custom-skeleton" />
          ) : undefined
        }
      />
    );

    const { container } = render(
      <DataTable
        tableName="test-table-small-row-custom-cell-skeleton"
        columns={ioColumns}
        rowHeight="s"
        data={{ isLoading: true, isError: false }}
        loadingRowsComponent={IOLoadingRows}
      />,
    );

    expect(
      screen.queryByTestId("io-column-custom-skeleton"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll("tbody .animate-pulse")).toHaveLength(4);
  });
});
