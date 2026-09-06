import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TableViewPresetTableName } from "@langfuse/shared";
import {
  TableViewPresetsDrawerContent,
  TableViewPresetsDrawerRoot,
} from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import { LAYER_ORDER } from "@/src/components/ui/layer";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/sharedUi.json";

vi.mock("@/src/components/table/table-view-presets/hooks/useViewData", () => ({
  useViewData: () => ({ TableViewPresetsList: [] }),
}));

vi.mock(
  "@/src/components/table/table-view-presets/hooks/useViewMutations",
  () => ({
    useViewMutations: () => ({
      createMutation: { mutate: vi.fn(), isPending: false },
      updateConfigMutation: { mutate: vi.fn() },
      updateNameMutation: { mutate: vi.fn(), isPending: false },
      deleteMutation: { mutateAsync: vi.fn(), isPending: false },
      generatePermalinkMutation: { mutate: vi.fn() },
    }),
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ TableViewPresets: { invalidate: vi.fn() } }),
    TableViewPresets: {
      getDefaultAssignments: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
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

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

function installOverlayLayers() {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
}

describe("table view preset localization", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "matchMedia",
      () =>
        ({
          matches: true,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) satisfies Partial<MediaQueryList>,
    );
  });

  beforeEach(() => installOverlayLayers());

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("localizes the view drawer and create-view flow", () => {
    const viewConfig = {
      tableName: TableViewPresetTableName.Traces,
      projectId: "project-id",
      controllers: {
        selectedViewId: null,
        appliedViewId: null,
        handleSetViewId: vi.fn(),
        applyViewState: vi.fn(),
      },
    };

    render(
      <NextIntlClientProvider
        locale="zh-CN"
        messages={{ sharedUi: chineseMessages }}
      >
        <TableViewPresetsDrawerRoot
          tableName={viewConfig.tableName}
          open
          onOpenChange={vi.fn()}
        >
          <TableViewPresetsDrawerContent
            viewConfig={viewConfig}
            currentState={{
              orderBy: null,
              filters: [],
              columnOrder: [],
              columnVisibility: {},
              searchQuery: "",
            }}
          />
        </TableViewPresetsDrawerRoot>
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("视图")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索视图...")).toBeInTheDocument();
    expect(screen.getByText("当前工作视图")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建自定义视图" }));

    expect(screen.getByText("保存当前表格视图")).toBeInTheDocument();
    expect(screen.getByText("视图名称")).toBeInTheDocument();
    expect(screen.getByText("取消")).toBeInTheDocument();
    expect(screen.getByText("保存视图")).toBeInTheDocument();
  });
});
