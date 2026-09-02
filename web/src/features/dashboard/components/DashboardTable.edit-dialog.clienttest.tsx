import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LAYER_ORDER } from "@/src/components/ui/layer";

const projectDashboardRow = {
  id: "dashboard-1",
  name: "My dashboard",
  description: "A dashboard",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  owner: "PROJECT" as const,
};

vi.mock("@/src/utils/api", () => ({
  api: {
    dashboard: {
      allDashboards: {
        useQuery: () => ({
          data: {
            dashboards: [projectDashboardRow],
            totalCount: 1,
          },
          isError: false,
          isPending: false,
        }),
      },
      updateDashboardMetadata: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(async () => ({})),
        }),
      },
      cloneDashboard: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(async () => ({})),
        }),
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
          mutateAsync: vi.fn(async () => ({})),
        }),
      },
    },
    useUtils: () => ({
      dashboard: { invalidate: vi.fn() },
    }),
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn(), query: { projectId: "project-1" } }),
}));

vi.mock("@/src/features/orderBy/hooks/useOrderByState", () => ({
  useOrderByState: (initial: { column: string; order: string }) => [
    initial,
    vi.fn(),
  ],
}));

vi.mock("use-query-params", async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryParams: () => [{ pageIndex: 0, pageSize: 50 }, vi.fn()],
}));

vi.mock("@/src/features/navigate-detail-pages/context", () => ({
  useDetailPageLists: () => ({ setDetailPageList: vi.fn() }),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

import { DashboardTable } from "./DashboardTable";

const installOverlayLayers = () => {
  const overlayRoot = document.createElement("div");
  overlayRoot.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const layerNode = document.createElement("div");
    layerNode.setAttribute("data-layer", layer);
    overlayRoot.appendChild(layerNode);
  }
  document.body.appendChild(overlayRoot);
};

describe("DashboardTable edit dialog", () => {
  beforeEach(() => {
    installOverlayLayers();
  });

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("keeps the edit dialog open after the row actions menu closes", async () => {
    render(<DashboardTable />);

    // Open the row actions menu (one trigger per row, labelled by the column).
    const triggers = screen.getAllByRole("button");
    const menuTrigger = triggers.find((button) =>
      button.getAttribute("aria-haspopup")?.includes("menu"),
    );
    expect(menuTrigger).toBeDefined();
    menuTrigger!.focus();
    fireEvent.keyDown(menuTrigger!, { key: "Enter" });

    const editItem = await screen.findByRole("menuitem", { name: /edit/i });
    fireEvent.click(editItem);

    // The menu closed, so its content unmounted. The dialog, rendered as a
    // sibling of the menu, must still be up and editable.
    await waitFor(() => {
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    });

    const nameInput = await screen.findByRole("textbox", { name: /name/i });
    expect(nameInput).toBeVisible();
  });
});
