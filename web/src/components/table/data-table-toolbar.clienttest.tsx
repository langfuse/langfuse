import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { ColumnDefinition } from "@langfuse/shared";
import { ExperimentFormatSetting } from "@/src/features/experiments";
import {
  DataTableToolbar,
  type MultiSelect,
} from "@/src/components/table/data-table-toolbar";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { useStore } from "zustand";

const captureSpy = vi.fn();
vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: captureSpy }),
}));

function MobileSearchHarness() {
  const { store } = useEventsSearchBar({
    tableName: "test-table",
    enabled: true,
    isV4: false,
    filterState: [],
    searchQuery: null,
    searchType: ["id"],
    observed: undefined,
    setFilterState: vi.fn(),
    setSearchQuery: vi.fn(),
    setSearchType: vi.fn(),
  });
  const draft = useStore(store, (state) => state.draft);

  return (
    <input
      aria-label="Mobile search"
      value={draft}
      onChange={(event) =>
        store.getState().actions.setDraft(event.target.value)
      }
    />
  );
}

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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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
          tableName="test-table"
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

describe("DataTableToolbar presentation controls", () => {
  const settingsProps = {
    columns: [],
    tableName: "test-table",
    columnVisibility: {},
    setColumnVisibility: vi.fn(),
    rowHeight: "s" as const,
    setRowHeight: vi.fn(),
  };

  it("renders Columns and row height as separate controls by default", () => {
    render(<DataTableToolbar {...settingsProps} />);

    expect(
      screen.getByRole("button", { name: /^Columns/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Table settings" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the format switch accessible while the column picker is closed", () => {
    const onIoRenderModeChange = vi.fn();
    render(
      <DataTableToolbar
        {...settingsProps}
        toolbarSettings={
          <ExperimentFormatSetting
            ioRenderMode="json"
            onIoRenderModeChange={onIoRenderModeChange}
          />
        }
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "JSON" }));
    expect(onIoRenderModeChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Formatted" }));
    expect(onIoRenderModeChange).toHaveBeenCalledExactlyOnceWith("text");
    fireEvent.click(screen.getByRole("button", { name: /^Columns/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Row height" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "JSON" })).toBeVisible();
  });

  it("opens legacy filters and search together in the mobile sheet", () => {
    captureSpy.mockClear();
    const filterColumns: ColumnDefinition[] = [
      {
        id: "status",
        name: "Status",
        type: "stringOptions",
        internal: "status",
        options: [{ value: "active" }],
      },
    ];

    render(
      <DataTableToolbar
        columns={[]}
        tableName="test-table"
        filterColumnDefinition={filterColumns}
        filterState={[]}
        setFilterState={vi.fn()}
        mobileSearch={<MobileSearchHarness />}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Filters" })[0]!);

    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add filter" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Mobile search" }), {
      target: { value: "unsubmitted draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Filters" })[0]!);

    expect(screen.getByRole("textbox", { name: "Mobile search" })).toHaveValue(
      "unsubmitted draft",
    );
    expect(
      captureSpy.mock.calls.filter(
        ([event]) => event === "filters:sidebar_toggled",
      ),
    ).toEqual([
      [
        "filters:sidebar_toggled",
        {
          tableName: "test-table",
          isV4: false,
          open: true,
          trigger: "toolbar",
        },
        undefined,
      ],
      [
        "filters:sidebar_toggled",
        {
          tableName: "test-table",
          isV4: false,
          open: false,
          trigger: "header",
        },
        undefined,
      ],
      [
        "filters:sidebar_toggled",
        {
          tableName: "test-table",
          isV4: false,
          open: true,
          trigger: "toolbar",
        },
        undefined,
      ],
    ]);
  });
});
