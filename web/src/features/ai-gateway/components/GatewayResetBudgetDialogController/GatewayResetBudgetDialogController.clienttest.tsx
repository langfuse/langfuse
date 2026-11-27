// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  GatewayResetBudgetDialogController,
  type GatewayResetBudgetTarget,
} from "./GatewayResetBudgetDialogController";

const mocks = vi.hoisted(() => ({
  resetBudget: vi.fn(),
  mutationReset: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("@/src/features/ai-gateway/hooks/useResetGatewayBudget", () => ({
  useResetGatewayBudget: () => ({
    resetBudget: mocks.resetBudget,
    mutation: {
      isPending: false,
      error: null,
      reset: mocks.mutationReset,
    },
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

const sentinelTargets: GatewayResetBudgetTarget[] = [
  {
    scope: "USER",
    subjectId: "user-1",
    name: "sentinel-user-display-name",
    isDefault: false,
  },
  {
    scope: "API_KEY",
    subjectId: "key-1",
    name: "sentinel-api-key-label",
    isDefault: true,
  },
];

describe("GatewayResetBudgetDialogController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(sentinelTargets)(
    "blocks customer-controlled $scope names in the portaled reset dialog from session replay",
    (target) => {
      render(
        <LayerProvider>
          <GatewayResetBudgetDialogController
            organizationId="org-1"
            surface="budgets_page"
          >
            {({ openDialog }) => (
              <button type="button" onClick={() => openDialog(target)}>
                Reset budget
              </button>
            )}
          </GatewayResetBudgetDialogController>
        </LayerProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Reset budget" }));

      const dialog = screen.getByRole("dialog");
      const description = screen.getByText(target.name, { exact: false });

      expect(dialog).toHaveClass("ph-no-capture");
      expect(description.closest(".ph-no-capture")).toBe(dialog);
    },
  );
});
