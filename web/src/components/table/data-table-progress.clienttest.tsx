import { render, screen } from "@testing-library/react";
import { DataTable } from "./data-table";
import { type LangfuseColumnDef } from "./types";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/components/table/hooks/useColumnSizing", () => ({
  useColumnSizing: () => ({
    columnSizing: {},
    setColumnSizing: vi.fn(),
  }),
}));

describe("DataTable query progress", () => {
  it("renders progress above loading rows", () => {
    const columns: LangfuseColumnDef<{ id: string }>[] = [
      {
        accessorKey: "id",
        header: "ID",
      },
    ];

    render(
      <DataTable
        tableName="progress-test"
        columns={columns}
        data={{
          isLoading: true,
          isError: false,
          progress: {
            readRows: 1_500,
            totalRowsToRead: 3_000,
            readBytes: 0,
            elapsedNs: 0,
            fraction: 0.5,
          },
        }}
      />,
    );

    expect(
      screen.getByRole("progressbar", { name: "Query progress" }),
    ).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("Reading 2K / ~3K rows")).toBeInTheDocument();
  });

  it("renders progress without replacing retained rows", () => {
    const columns: LangfuseColumnDef<{ id: string }>[] = [
      {
        accessorKey: "id",
        header: "ID",
      },
    ];

    render(
      <DataTable
        tableName="progress-with-data-test"
        columns={columns}
        data={{
          isLoading: false,
          isError: false,
          data: [{ id: "retained-row" }],
          progress: {
            readRows: 25,
            totalRowsToRead: 100,
            readBytes: 0,
            elapsedNs: 0,
            fraction: 0.25,
            phase: "enriching",
          },
        }}
      />,
    );

    expect(screen.getByText("retained-row")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Query progress" }),
    ).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Preparing results...")).toBeInTheDocument();
  });
});
