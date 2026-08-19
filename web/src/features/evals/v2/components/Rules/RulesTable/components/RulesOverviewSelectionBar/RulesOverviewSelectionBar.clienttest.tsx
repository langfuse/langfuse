import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTableSelectionStore } from "@/src/components/table/table-selection-store";
import { RulesOverviewSelectionBar } from "./RulesOverviewSelectionBar";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  invalidateList: vi.fn(),
}));

vi.mock(
  "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/ActivationConfirmationDialog",
  () => ({ ActivationConfirmationDialog: () => null }),
);

vi.mock(
  "@/src/features/evals/v2/components/Rules/RulesTable/components/RulesOverviewSelectionBar/RulesOverviewSelectionBarView",
  () => ({
    RulesOverviewSelectionBarView: ({
      onDisable,
    }: {
      onDisable: () => void;
    }) => <button onClick={onDisable}>Disable</button>,
  }),
);

vi.mock("@/src/features/evals/v2/hooks/useActivationConfirmation", () => ({
  useActivationConfirmation: () => ({
    confirmation: null,
    estimate: { status: "idle" },
    setOpen: vi.fn(),
    setSampling: vi.fn(),
    confirmActivation: vi.fn(),
    requestActivation: vi.fn(),
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evalsV2: {
        rules: {
          list: { invalidate: mocks.invalidateList },
          filterOptions: { invalidate: vi.fn() },
        },
      },
    }),
    evalsV2: {
      rules: {
        setManyEnabled: {
          useMutation: ({
            onSuccess,
          }: {
            onSuccess: (
              result: { success: boolean; ruleIds: string[] },
              variables: unknown,
            ) => unknown;
          }) => ({
            isPending: false,
            mutate: (variables: unknown) =>
              onSuccess(
                { success: true, ruleIds: ["rule-1", "rule-2", "rule-3"] },
                variables,
              ),
            mutateAsync: vi.fn(),
          }),
        },
        deleteMany: {
          useMutation: () => ({ isPending: false, mutate: vi.fn() }),
        },
      },
    },
  },
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

describe("RulesOverviewSelectionBar", () => {
  it("tracks the resolved rule count for an all-matching status change", async () => {
    const selectionStore = createTableSelectionStore();
    selectionStore.getState().actions.setSelectAll(true);

    render(
      <RulesOverviewSelectionBar
        projectId="project-1"
        hasWriteAccess
        searchQuery="active rules"
        totalCount={3}
        selectionStore={selectionStore}
        filterState={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() =>
      expect(mocks.capture).toHaveBeenCalledWith(
        "evaluation_rules:status_change",
        { isEnabled: false, ruleCount: 3 },
      ),
    );
  });
});
