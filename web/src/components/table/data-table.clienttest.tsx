import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type OrderByState } from "@langfuse/shared";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

type Row = { scoreName: string; status: string };

const columns: LangfuseColumnDef<Row>[] = [
  {
    accessorKey: "scoreName",
    id: "scoreName",
    header: "Generated Score Name",
    enableSorting: true,
  },
  {
    accessorKey: "status",
    id: "status",
    header: "Status",
  },
];

const rows: Row[] = [
  { scoreName: "zeta-score", status: "ACTIVE" },
  { scoreName: "alpha-score", status: "ACTIVE" },
];

function SortableTable({ initialOrderBy }: { initialOrderBy: OrderByState }) {
  const [orderBy, setOrderBy] = useState<OrderByState>(initialOrderBy);

  return (
    <DataTable
      tableName="evalConfigsTest"
      columns={columns}
      orderBy={orderBy}
      setOrderBy={setOrderBy}
      hidePagination
      data={{
        isLoading: false,
        isError: false,
        data: rows,
      }}
    />
  );
}

describe("DataTable column sorting affordances", () => {
  it("does not show a sort indicator on a non-sortable column even if orderBy points at it", () => {
    render(
      <SortableTable initialOrderBy={{ column: "status", order: "ASC" }} />,
    );

    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText("▼")).not.toBeInTheDocument();
  });

  it("shows a sort indicator on a sortable column and toggles order on click", () => {
    render(
      <SortableTable initialOrderBy={{ column: "scoreName", order: "ASC" }} />,
    );

    const nameHeader = screen.getByText("Generated Score Name").closest("th");
    expect(nameHeader).toHaveTextContent("▲");

    fireEvent.click(nameHeader!);
    expect(nameHeader).not.toHaveTextContent("▲");
    expect(nameHeader).not.toHaveTextContent("▼");

    fireEvent.click(nameHeader!);
    expect(nameHeader).toHaveTextContent("▼");
  });

  it("does not change orderBy when a non-sortable header is clicked", () => {
    render(
      <SortableTable initialOrderBy={{ column: "scoreName", order: "ASC" }} />,
    );

    const nameHeader = screen.getByText("Generated Score Name").closest("th");
    const statusHeader = screen.getByText("Status").closest("th");

    fireEvent.click(statusHeader!);

    expect(nameHeader).toHaveTextContent("▲");
    expect(statusHeader).not.toHaveTextContent("▲");
    expect(statusHeader).not.toHaveTextContent("▼");
  });
});
