import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { type LangfuseColumnDef } from "@/src/components/table/types";
import { SimpleDataTable } from "./simple-data-table";

const columns: LangfuseColumnDef<{ id: string; name: string }>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div data-row-click-ignore>
        <button type="button">{row.original.name}</button>
      </div>
    ),
  },
];

describe("SimpleDataTable", () => {
  it("activates clickable rows without intercepting nested controls", () => {
    const onRowClick = vi.fn();

    render(
      <SimpleDataTable
        columns={columns}
        data={[{ id: "row-1", name: "Nested action" }]}
        isLoading={false}
        noResults={null}
        onRowClick={onRowClick}
        getRowLabel={(row) => `Open ${row.name}`}
      />,
    );

    const button = screen.getByRole("button", { name: "Nested action" });
    const row = button.closest("tr");

    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("role", "button");
    expect(row).toHaveAccessibleName("Open Nested action");
    expect(row).toHaveAttribute("aria-keyshortcuts", "Enter Space");

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.keyDown(row!, { key: "Enter" });
    fireEvent.keyDown(row!, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it("exposes selected rows to assistive technology", () => {
    render(
      <SimpleDataTable
        columns={columns}
        data={[{ id: "row-1", name: "Selected row" }]}
        isLoading={false}
        noResults={null}
        selectedRowId="row-1"
        onRowClick={vi.fn()}
        getRowLabel={(row) => `Select ${row.name}`}
      />,
    );

    expect(
      screen.getByRole("row", { name: "Select Selected row" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("hides responsive columns consistently", () => {
    const responsiveColumns: LangfuseColumnDef<{
      id: string;
      name: string;
      detail: string;
    }>[] = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "detail",
        header: "Detail",
        hideBelowMd: true,
      },
    ];

    render(
      <SimpleDataTable
        columns={responsiveColumns}
        data={[{ id: "row-1", name: "Name value", detail: "Detail value" }]}
        isLoading={false}
        noResults={null}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Detail" })).toHaveClass(
      "hidden",
      "md:table-cell",
    );
    expect(screen.getByRole("cell", { name: "Detail value" })).toHaveClass(
      "hidden",
      "md:table-cell",
    );
  });
});
