/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConnectedTraceObservationAddToDropdownMenuController } from "./ConnectedTraceObservationAddToDropdownMenuController";

vi.mock("@langfuse/shared", () => ({
  AnnotationQueueObjectType: { TRACE: "TRACE", OBSERVATION: "OBSERVATION" },
}));
vi.mock("@/src/features/annotation-queues", () => ({
  AnnotationQueueSubmenuItemController: ({
    children,
  }: {
    children: (control: { item: unknown; totalCount: number }) => ReactNode;
  }) => children({ item: { id: "annotation-queue" }, totalCount: 2 }),
}));
vi.mock("@/src/features/datasets", () => ({
  NewDatasetItemFromExistingObjectDialogController: ({
    children,
  }: {
    children: (control: { openDialog: () => void }) => ReactNode;
  }) => children({ openDialog: vi.fn() }),
}));
vi.mock(
  "@/src/features/datasets/components/CreateDatasetDialogController",
  () => ({
    CreateDatasetDialogController: ({
      children,
    }: {
      children: (control: {
        disabled: undefined;
        openDialog: () => void;
      }) => ReactNode;
    }) => children({ disabled: undefined, openDialog: vi.fn() }),
  }),
);
vi.mock("@/src/components/design-system/DropdownMenu/DropdownMenu", () => ({
  DropdownMenu: ({
    children,
  }: {
    children: (control: {
      getTriggerProps: () => Record<string, never>;
    }) => ReactNode;
  }) => <>{children({ getTriggerProps: () => ({}) })}</>,
}));
vi.mock(
  "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController",
  () => ({
    useJumpToPlayground: () => ({
      disabled: false,
      handlePlaygroundAction: vi.fn(),
      includeOutput: false,
      setIncludeOutput: vi.fn(),
      title: "",
    }),
  }),
);
vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: { useQuery: () => ({ data: [], isLoading: false }) },
    },
  },
}));

describe("ConnectedTraceObservationAddToDropdownMenuController", () => {
  it("forwards the annotation queue count to its trigger", () => {
    render(
      <ConnectedTraceObservationAddToDropdownMenuController
        analyticsData={{ source: "TraceDetail", isV4: true }}
        input={null}
        metadata={null}
        output={null}
        projectId="project"
        traceId="trace"
        variant="trace"
      >
        {({ totalCount }) => <span>Queue count: {totalCount}</span>}
      </ConnectedTraceObservationAddToDropdownMenuController>,
    );

    expect(screen.getByText("Queue count: 2")).toBeTruthy();
  });
});
