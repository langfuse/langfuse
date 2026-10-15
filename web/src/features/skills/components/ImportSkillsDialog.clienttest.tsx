import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ImportSkillsDialog } from "./ImportSkillsDialog";
import { SkillsPage } from "./SkillsPage";

const { discoverLocalSkills, byName, createVersion, invalidate, listState } =
  vi.hoisted(() => ({
    discoverLocalSkills: vi.fn(),
    byName: vi.fn(),
    createVersion: vi.fn(),
    invalidate: vi.fn(),
    listState: { totalItems: 0 },
  }));

vi.mock("use-query-params", () => ({
  NumberParam: {},
  withDefault: vi.fn(),
  useQueryParams: () => [{ pageIndex: 0, pageSize: 50 }, vi.fn()],
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project",
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/feature-flags", () => ({
  InternalFeatureBadge: () => null,
}));
vi.mock("../hooks/useSkillInstallOptions", () => ({
  useSkillInstallOptions: () => ({ query: { data: { tags: [] } } }),
}));
vi.mock("./InstallSkillDialog", () => ({ InstallSkillDialog: () => null }));
vi.mock("@/src/features/filters", () => ({
  useSidebarFilterState: () => ({ filterState: [] }),
}));
vi.mock("@/src/features/search-bar", () => ({
  TableSearchBar: () => null,
  toObservedOptions: vi.fn(),
  useFullTextSearch: () => ({ searchQuery: "", setSearchQuery: vi.fn() }),
}));
vi.mock("@/src/components/table/data-table-controls", () => ({
  DataTableControlsProvider: ({ children }: { children: ReactNode }) =>
    children,
  DataTableControls: () => null,
}));
vi.mock("@/src/components/table/FilterToggleButton", () => ({
  FilterToggleButton: () => null,
}));
vi.mock("@/src/components/table/resizable-filter-layout", () => ({
  ResizableFilterLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/components/design-system/table/Table", () => ({
  Table: () => <div>Imported skills table</div>,
}));
vi.mock("@/src/components/design-system/PaginationBar/PaginationBar", () => ({
  PaginationBar: () => null,
}));
vi.mock("../utils/local-import", () => ({ discoverLocalSkills }));
vi.mock("@/src/features/notifications", () => ({ showSuccessToast: vi.fn() }));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  getTrpcErrorCode: vi.fn(),
  api: {
    useUtils: () => ({
      skills: { invalidate },
      client: { skills: { byName: { query: byName } } },
    }),
    skills: {
      all: {
        useQuery: () => ({
          data: { data: [], meta: { totalItems: listState.totalItems } },
        }),
      },
      filterOptions: { useQuery: () => ({ data: { tags: [] } }) },
      deleteSkill: { useMutation: () => ({}) },
      createVersion: {
        useMutation: () => ({ mutateAsync: createVersion, reset: vi.fn() }),
      },
    },
  },
}));

const firstSkill = {
  name: "review-code",
  path: "review-code",
  description: "Review a change",
  files: [{ path: "SKILL.md", content: "Review instructions" }],
  error: null,
};
const secondSkill = {
  name: "write-tests",
  path: "write-tests",
  description: "Write regression tests",
  files: [{ path: "SKILL.md", content: "Testing instructions" }],
  error: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  listState.totalItems = 0;
});
afterEach(cleanup);

describe("ImportSkillsDialog", () => {
  it("keeps failed imports retryable when the first import populates the skills page", async () => {
    createVersion
      .mockResolvedValueOnce({ version: 1 })
      .mockRejectedValueOnce(new Error("Storage temporarily unavailable"))
      .mockResolvedValueOnce({ version: 1 });
    discoverLocalSkills.mockResolvedValue([firstSkill, secondSkill]);
    byName.mockResolvedValue(undefined);
    const page = render(<SkillsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Import skills" }));
    fireEvent.change(
      screen.getByRole("dialog").querySelector('input[type="file"]')!,
      { target: { files: [new File(["Instructions"], "SKILL.md")] } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Import 2 skills" }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    listState.totalItems = 1;
    page.rerender(<SkillsPage />);

    expect(screen.getByText("Imported skills table")).toBeInTheDocument();
    expect(
      screen.getByText("Storage temporarily unavailable"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 skill" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(createVersion.mock.calls.map(([input]) => input.files)).toEqual([
      firstSkill.files,
      secondSkill.files,
      secondSkill.files,
    ]);
  });

  it("retries a failed import without creating another version of successful skills", async () => {
    createVersion
      .mockResolvedValueOnce({ version: 3 })
      .mockRejectedValueOnce(new Error("Storage temporarily unavailable"))
      .mockResolvedValueOnce({ version: 2 });
    discoverLocalSkills.mockResolvedValue([firstSkill, secondSkill]);
    byName.mockImplementation(async ({ name }) => ({ name, files: [] }));
    render(
      <ImportSkillsDialog projectId="project">
        {(openDialog) => <button onClick={openDialog}>Open import</button>}
      </ImportSkillsDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open import" }));
    fireEvent.change(
      screen.getByRole("dialog").querySelector('input[type="file"]')!,
      { target: { files: [new File(["Instructions"], "SKILL.md")] } },
    );
    await screen.findByRole("checkbox", { name: /review-code/ });
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 skills" }));

    await screen.findByText("Storage temporarily unavailable");
    expect(
      screen.getByRole("checkbox", { name: /review-code/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /review-code/ }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Import 1 skill" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(createVersion.mock.calls.map(([input]) => input.files)).toEqual([
      firstSkill.files,
      secondSkill.files,
      secondSkill.files,
    ]);
  });
});
