import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { TableViewPresetTableName } from "@langfuse/shared";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import {
  getMetadataColumnId,
  stripMetadataColumnsFromView,
} from "@/src/features/metadata-columns/metadata-columns";
import { TableViewPresetsDrawerContent } from "./data-table-view-presets-drawer";

const { createView, updateView } = vi.hoisted(() => ({
  createView: vi.fn(),
  updateView: vi.fn(),
}));

const savedViews = [
  {
    id: "saved-view",
    name: "Saved traces",
    isSystem: false,
    filters: [],
    orderBy: null,
    searchQuery: "stored search",
    columnOrder: ["startTime", getMetadataColumnId("host"), "userId"],
    columnVisibility: {
      startTime: true,
      [getMetadataColumnId("host")]: false,
      userId: false,
    },
  },
];

vi.mock("@/src/components/table/table-view-presets/hooks/useViewData", () => ({
  useViewData: () => ({ TableViewPresetsList: savedViews }),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({}),
    TableViewPresets: {
      getDefaultAssignments: { useQuery: () => ({ data: {} }) },
      create: { useMutation: () => ({ mutate: createView, isPending: false }) },
      update: { useMutation: () => ({ mutate: updateView, isPending: false }) },
      updateName: { useMutation: () => ({ mutate: vi.fn() }) },
      delete: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      generatePermalink: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));
vi.mock(
  "@/src/components/table/table-view-presets/hooks/useDefaultViewMutations",
  () => ({
    useDefaultViewMutations: () => ({
      setViewAsDefault: vi.fn(),
      clearViewDefault: vi.fn(),
      isSettingDefault: false,
    }),
  }),
);
vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/notifications", () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));

// Keep the drawer's business logic and form; omit its portal/gesture shell.
vi.mock("@/src/components/ui/drawer", () => {
  const Shell = ({ children }: { children: ReactNode }) => children;
  return {
    Drawer: Shell,
    DrawerTrigger: Shell,
    DrawerContent: Shell,
    DrawerHeader: Shell,
    DrawerTitle: Shell,
    DrawerClose: Shell,
  };
});

type Props = ComponentProps<typeof TableViewPresetsDrawerContent>;

function makeProps(appliedViewId: string | null): Props {
  return {
    viewConfig: {
      tableName: TableViewPresetTableName.ObservationsEvents,
      projectId: "project-a",
      prepareStateForSave: stripMetadataColumnsFromView,
      controllers: {
        selectedViewId: "saved-view",
        appliedViewId,
        handleSetViewId: vi.fn(),
        applyViewState: vi.fn(),
      },
    },
    currentState: {
      orderBy: { column: "startTime", order: "DESC" },
      filters: [
        {
          column: "metadata",
          type: "stringObject",
          key: "repo",
          operator: "=",
          value: "langfuse",
        },
      ],
      columnOrder: ["name", getMetadataColumnId("repo"), "level"],
      columnVisibility: {
        name: true,
        [getMetadataColumnId("repo")]: true,
        level: false,
      },
      searchQuery: "live search",
    },
  };
}

function renderDrawer(props: Props) {
  render(
    <LayerProvider>
      <TooltipProvider>
        <TableViewPresetsDrawerContent {...props} />
      </TooltipProvider>
    </LayerProvider>,
  );
}

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => vi.clearAllMocks());

it("creates a view without browser-local metadata columns while keeping live filters", async () => {
  const props = makeProps(null);
  renderDrawer(props);

  fireEvent.click(screen.getByRole("button", { name: "Create Custom View" }));
  fireEvent.change(screen.getByLabelText("View name"), {
    target: { value: "My traces" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save View" }));

  await waitFor(() => {
    expect(createView).toHaveBeenCalledWith({
      ...props.currentState,
      projectId: "project-a",
      tableName: TableViewPresetTableName.ObservationsEvents,
      name: "My traces",
      columnOrder: ["name", "level"],
      columnVisibility: { name: true, level: false },
    });
  });
});

it.each([true, false])(
  "updates a view after removing metadata columns from the chosen layout, applied=%s",
  (applied) => {
    const props = makeProps(applied ? "saved-view" : null);
    renderDrawer(props);

    fireEvent.click(
      screen.getByRole("button", { name: "Update view with current filters" }),
    );

    expect(updateView).toHaveBeenCalledWith({
      ...props.currentState,
      projectId: "project-a",
      tableName: TableViewPresetTableName.ObservationsEvents,
      id: "saved-view",
      name: "Saved traces",
      columnOrder: applied ? ["name", "level"] : ["startTime", "userId"],
      columnVisibility: applied
        ? { name: true, level: false }
        : { startTime: true, userId: false },
    });
  },
);
