import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import EvaluatorsV2Page from "@/src/features/evals/v2/pages/evaluators";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  openAssistant: vi.fn(),
  push: vi.fn(),
  selectConversation: vi.fn(),
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
vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useCanUseInAppAgent: () => true,
    useInAppAiAgent: () => ({
      openAssistant: mocks.openAssistant,
      selectConversation: mocks.selectConversation,
    }),
  }),
);

describe("EvaluatorsV2Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the assistant on the evaluator overview", () => {
    render(<EvaluatorsV2Page />);

    fireEvent.keyDown(screen.getByRole("button", { name: "New evaluator" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /create with ai/i }));

    expect(mocks.capture).toHaveBeenCalledWith(
      "eval_config:creation_path_selected",
      { source: "ai" },
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.selectConversation).toHaveBeenCalledWith(null);
    expect(mocks.openAssistant).toHaveBeenCalledWith("evaluator_create");
  });
});
