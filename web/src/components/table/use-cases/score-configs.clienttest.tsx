import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";

import { ScoreConfigsTable } from "./score-configs";

vi.mock("@/src/utils/api", () => ({
  api: {
    scoreConfigs: {
      all: {
        useQuery: () => ({
          data: {
            totalCount: 1,
            configs: [
              {
                id: "config-1",
                name: "Quality",
                dataType: "NUMERIC",
                description: null,
                createdAt: new Date("2026-01-01"),
                updatedAt: new Date("2026-01-01"),
                maxValue: 1,
                minValue: 0,
                categories: null,
                isArchived: false,
              },
            ],
          },
          isPending: false,
          isError: false,
        }),
      },
      byId: {
        useQuery: () => ({ isSuccess: false }),
      },
    },
  },
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/hooks/usePaginationState", () => ({
  usePaginationState: () => [{ pageIndex: 0, pageSize: 50 }, vi.fn()],
}));

vi.mock("@/src/components/table/data-table-row-height-switch", () => ({
  useRowHeightLocalStorage: () => ["s", vi.fn()],
}));

vi.mock("@/src/features/column-visibility/hooks/useColumnVisibility", () => ({
  default: () => [{}, vi.fn()],
}));

vi.mock("@/src/features/column-visibility/hooks/useColumnOrder", () => ({
  default: () => [[], vi.fn()],
}));

vi.mock("@/src/components/table/data-table-toolbar", () => ({
  DataTableToolbar: () => null,
}));

vi.mock("@/src/components/layouts/settings-table-card", () => ({
  SettingsTableCard: ({ children }: { children: ReactNode }) => children,
}));

vi.mock(
  "@/src/features/score-configs/components/UpsertScoreConfigDialog",
  () => ({
    UpsertScoreConfigDialog: () => null,
  }),
);

vi.mock(
  "@/src/features/score-configs/components/ArchiveScoreConfigButton",
  () => ({
    ArchiveScoreConfigPopoverController: ({
      children,
    }: {
      children: (control: {
        disabled: undefined;
        Trigger: ({ children }: { children: ReactNode }) => ReactNode;
      }) => ReactNode;
    }) =>
      children({
        disabled: undefined,
        Trigger: ({ children }) => children,
      }),
  }),
);

vi.mock("@/src/components/ui/popover", () => ({
  PopoverAnchor: ({ children }: { children: ReactNode }) => (
    <div data-testid="archive-popover-anchor">{children}</div>
  ),
}));

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/src/components/table/data-table", () => ({
  DataTable: ({ columns, data }: { columns: unknown[]; data: unknown }) => {
    const actionColumn = columns.find(
      (column) => (column as { accessorKey?: string }).accessorKey === "action",
    ) as {
      cell: (context: { row: { original: unknown } }) => ReactNode;
    };
    const row = (data as { data: unknown[] }).data[0];
    return actionColumn.cell({ row: { original: row } });
  },
}));

describe("ScoreConfigsTable", () => {
  it("keeps a persistent anchor for the archive confirmation popover", () => {
    render(<ScoreConfigsTable projectId="project-1" />);

    expect(screen.getByTestId("archive-popover-anchor")).toContainElement(
      screen.getByRole("button"),
    );
  });
});
