import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { type LangfuseColumnDef } from "@/src/components/table/types";
import { SimpleDataTable } from "./simple-data-table";

const columns: LangfuseColumnDef<{ id: string; name: string }>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <button type="button">{row.original.name}</button>,
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
      />,
    );

    const button = screen.getByRole("button", { name: "Nested action" });
    const row = button.closest("tr");

    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("role", "button");

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.keyDown(row!, { key: "Enter" });
    fireEvent.keyDown(row!, { key: " " });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});
