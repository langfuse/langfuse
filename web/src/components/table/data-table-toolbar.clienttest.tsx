import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import {
  DataTableToolbar,
  type MultiSelect,
} from "@/src/components/table/data-table-toolbar";

const baseMultiSelect = (overrides: Partial<MultiSelect>): MultiSelect => ({
  selectAll: false,
  setSelectAll: vi.fn(),
  selectedRowIds: [],
  setRowSelection: vi.fn(),
  pageSize: 50,
  pageIndex: 0,
  totalCount: null,
  ...overrides,
});

const selectedIds = (count: number) =>
  Array.from({ length: count }, (_, i) => `row-${i}`);

describe("DataTableToolbar select-all banner gate", () => {
  describe("exact-count tables (v3)", () => {
    it("shows the exact-count banner when the full first page is selected", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: 500,
            selectedRowIds: selectedIds(50),
          })}
        />,
      );

      expect(
        screen.getByRole("button", {
          name: "Select all 500 items across 10 pages",
        }),
      ).toBeInTheDocument();
    });

    it("shows no banner while the count is unknown and no more-pages signal is provided", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: null,
            selectedRowIds: selectedIds(50),
          })}
        />,
      );

      expect(
        screen.queryByText(/items on this page are selected/),
      ).not.toBeInTheDocument();
    });

    it("shows no banner when all rows fit on one page", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: 30,
            selectedRowIds: selectedIds(30),
          })}
        />,
      );

      expect(
        screen.queryByText(/items on this page are selected/),
      ).not.toBeInTheDocument();
    });
  });

  describe("count-unknown tables with a more-pages signal (v4 events)", () => {
    it("shows the banner and flips select-all when the full first page is selected", () => {
      const setSelectAll = vi.fn();
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: null,
            hasNextPage: true,
            selectedRowIds: selectedIds(50),
            setSelectAll,
          })}
        />,
      );

      const selectAllButton = screen.getByRole("button", {
        name: "Select all matching items",
      });
      fireEvent.click(selectAllButton);
      expect(setSelectAll).toHaveBeenCalledWith(true);
    });

    it("keeps the banner visible while the lazy count is loading after select-all", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            selectAll: true,
            totalCount: null,
            hasNextPage: true,
            selectedRowIds: selectedIds(50),
          })}
        />,
      );

      expect(screen.getByText(/items are selected/)).toBeInTheDocument();
    });

    it("shows the exact count once the lazy count resolves after select-all", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            selectAll: true,
            totalCount: 823,
            hasNextPage: true,
            selectedRowIds: selectedIds(50),
          })}
        />,
      );

      expect(screen.getByText("823")).toBeInTheDocument();
      expect(screen.getByText(/items are selected/)).toBeInTheDocument();
    });

    it("shows no banner on the last page (no more matching rows)", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: null,
            hasNextPage: false,
            selectedRowIds: selectedIds(50),
          })}
        />,
      );

      expect(
        screen.queryByText(/items on this page are selected/),
      ).not.toBeInTheDocument();
    });

    it("shows no banner when the page is only partially selected", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: null,
            hasNextPage: true,
            selectedRowIds: selectedIds(10),
          })}
        />,
      );

      expect(
        screen.queryByText(/items on this page are selected/),
      ).not.toBeInTheDocument();
    });

    it("shows no banner beyond the first page", () => {
      render(
        <DataTableToolbar
          columns={[]}
          multiSelect={baseMultiSelect({
            totalCount: null,
            hasNextPage: true,
            pageIndex: 1,
            selectedRowIds: selectedIds(50),
          })}
        />,
      );

      expect(
        screen.queryByText(/items on this page are selected/),
      ).not.toBeInTheDocument();
    });
  });
});
