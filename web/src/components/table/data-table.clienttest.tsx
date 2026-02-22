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
});
