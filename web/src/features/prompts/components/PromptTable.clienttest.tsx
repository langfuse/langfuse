import { render } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import { PromptTable } from "./PromptTable";

const restoredFilters: FilterState = [
  {
    column: "tags",
    type: "arrayOptions",
    operator: "none of",
    value: ["archived"],
  },
];

const mockAllUseQuery = vi.fn((_input: unknown, _options: unknown) => ({
  data: undefined,
  isLoading: true,
  isSuccess: false,
  isError: false,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    prompts: {
      all: {
        useQuery: (input: unknown, options: unknown) =>
          mockAllUseQuery(input, options),
      },
      metrics: { useQuery: () => ({ data: undefined }) },
      filterOptions: {
        useQuery: () => ({ data: undefined, isPending: false }),
      },
    },
  },
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));
vi.mock("@/src/features/navigate-detail-pages/DetailPageListsProvider", () => ({
  useDetailPageLists: () => ({ setDetailPageList: vi.fn() }),
}));
vi.mock("@/src/features/filters/hooks/useFilterState", () => ({
  useQueryFilterState: () => [[]],
}));
vi.mock("@/src/features/filters/hooks/useSidebarFilterState", () => ({
  useSidebarFilterState: () => ({
    filterState: restoredFilters,
    explicitFilterState: restoredFilters,
    searchBarFilterState: restoredFilters,
    setFilterState: vi.fn(),
    onExpandedChange: vi.fn(),
    expanded: [],
    filters: [],
    draftResetKey: 0,
  }),
}));
vi.mock("@/src/features/orderBy/hooks/useOrderByState", () => ({
  useOrderByState: () => [{ column: "createdAt", order: "DESC" }, vi.fn()],
}));
vi.mock("@/src/features/folders/hooks/useFolderPagination", () => ({
  useFolderPagination: () => ({
    paginationState: { pageIndex: 0, pageSize: 50 },
    currentFolderPath: "",
    navigateToFolder: vi.fn(),
    resetPaginationAndFolder: vi.fn(),
    setPaginationAndFolderState: vi.fn(),
  }),
}));
vi.mock("@/src/features/search-bar/hooks/useFullTextSearch", () => ({
  useFullTextSearch: () => ({
    searchQuery: null,
    searchType: ["id"],
    setSearchQuery: vi.fn(),
    setSearchType: vi.fn(),
  }),
}));
vi.mock("@/src/features/column-visibility/hooks/useColumnOrder", () => ({
  default: () => [[], vi.fn()],
}));
vi.mock("@/src/features/column-visibility/hooks/useColumnVisibility", () => ({
  default: () => [{}, vi.fn()],
}));
vi.mock(
  "@/src/components/table/table-view-presets/hooks/useTableViewFilterChange",
  () => ({
    useTableViewFilterChange: () => ({
      viewControllersRef: { current: null },
      onExplicitFilterStateChange: vi.fn(),
    }),
  }),
);
vi.mock(
  "@/src/components/table/table-view-presets/hooks/useTableViewManager",
  () => ({
    useTableViewManager: () => ({
      isLoading: false,
      filterEditorResetKey: 0,
      handleUserStateChange: vi.fn(),
    }),
  }),
);
vi.mock("@/src/components/table/data-table", () => ({
  DataTable: () => null,
}));
vi.mock("@/src/components/table/data-table-controls", () => ({
  DataTableControlsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  DataTableControls: () => null,
}));
vi.mock("@/src/components/table/resizable-filter-layout", () => ({
  SearchableTableFilterLayout: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/src/features/search-bar/components/TableSearchBar", () => ({
  TableSearchBar: () => null,
}));
vi.mock("@/src/components/table/data-table-toolbar", () => ({
  DataTableToolbar: () => null,
}));

it("queries prompts using the filter shown after session restoration", () => {
  render(<PromptTable />);

  expect(mockAllUseQuery).toHaveBeenCalledWith(
    expect.objectContaining({ filter: restoredFilters }),
    expect.anything(),
  );
});
