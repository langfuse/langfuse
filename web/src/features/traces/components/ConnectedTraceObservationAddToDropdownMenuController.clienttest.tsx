// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { vi } from "vitest";

import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { ConnectedTraceObservationAddToDropdownMenuController } from "./ConnectedTraceObservationAddToDropdownMenuController";

vi.mock("@/src/features/annotation-queues", () => ({
  AnnotationQueueSubmenuItemController: ({
    children,
  }: {
    children: (controls: { item: object; totalCount: number }) => ReactNode;
  }) => children({ item: { type: "submenu", id: "queue" }, totalCount: 2 }),
}));

vi.mock(
  "@/src/features/datasets/components/CreateDatasetDialogController",
  () => ({
    CreateDatasetDialogController: ({
      children,
    }: {
      children: (controls: { openDialog: () => void }) => ReactNode;
    }) => children({ openDialog: vi.fn() }),
  }),
);
vi.mock("@/src/features/datasets", () => ({
  NewDatasetItemFromExistingObjectDialogController: ({
    children,
  }: {
    children: (controls: { openDialog: () => void }) => ReactNode;
  }) => children({ openDialog: vi.fn() }),
}));
vi.mock("@/src/components/design-system/DropdownMenu/DropdownMenu", () => ({
  DropdownMenu: ({
    children,
  }: {
    children: (controls: {
      getTriggerProps: () => Record<string, never>;
    }) => ReactNode;
  }) => children({ getTriggerProps: () => ({}) }),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock(
  "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController",
  () => ({
    useJumpToPlayground: () => ({
      handlePlaygroundAction: vi.fn(),
      includeOutput: false,
      setIncludeOutput: vi.fn(),
    }),
  }),
);
vi.mock("@/src/utils/api", () => ({
  api: { datasets: { allDatasetMeta: { useQuery: () => ({ data: [] }) } } },
}));

it("shows an existing queue membership on the Add to trigger", () => {
  render(
    <ConnectedTraceObservationAddToDropdownMenuController
      projectId="project"
      traceId="trace"
      variant="trace"
      input={null}
      output={null}
      metadata={null}
      analyticsData={{ source: "TraceDetail", isV4: false }}
    >
      {({ getTriggerProps, totalCount }) => (
        <button {...getTriggerProps()}>
          Add to
          {totalCount > 0 && <ActionButtonCountBadge count={totalCount} />}
        </button>
      )}
    </ConnectedTraceObservationAddToDropdownMenuController>,
  );

  expect(screen.getByRole("button", { name: "Add to 2" })).toBeVisible();
});
