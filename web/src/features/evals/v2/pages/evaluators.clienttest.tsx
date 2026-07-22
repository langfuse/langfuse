import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import EvaluatorsV2Page from "@/src/features/evals/v2/pages/evaluators";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project-1" },
    push: mocks.push,
  }),
}));

vi.mock("@/src/components/layouts/page", () => ({
  default: ({
    children,
    headerProps,
  }: {
    children: ReactNode;
    headerProps: {
      tabsProps?: { actionButtonsRight?: ReactNode };
    };
  }) => (
    <>
      {headerProps.tabsProps?.actionButtonsRight}
      {children}
    </>
  ),
}));

vi.mock("@/src/features/evals/v2/components/EvaluatorGalleryDialog", () => ({
  EvaluatorGalleryDialog: () => null,
}));
vi.mock("@/src/features/evals/v2/components/EvaluatorOverviewTable", () => ({
  EvaluatorOverviewTable: () => null,
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
describe("EvaluatorsV2Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.push.mockResolvedValue(true);
  });

  it("opens the template gallery from the evaluator overview", () => {
    render(<EvaluatorsV2Page />);

    fireEvent.click(screen.getByRole("button", { name: "New evaluator" }));

    expect(mocks.capture).toHaveBeenCalledWith(
      "eval_config:creation_path_selected",
      { source: "template" },
    );
    expect(mocks.push).toHaveBeenCalledWith(
      {
        query: { projectId: "project-1", gallery: "1" },
      },
      undefined,
      { shallow: true },
    );
  });
});
