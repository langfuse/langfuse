import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { AnnotationQueueScoreConfigsDialogController } from "./AnnotationQueueScoreConfigsDialogController";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  fetchedAfterMount: false,
  refetchFailed: false,
}));

vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("./QueueScoreConfigFields", () => ({
  QueueScoreConfigFields: ({
    value,
    onChange,
  }: {
    value: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <>
      <output aria-label="Selected config IDs">{value.join(",")}</output>
      <button onClick={() => onChange([...value, "second-config"])}>
        Add existing config
      </button>
    </>
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ annotationQueues: { invalidate: vi.fn() } }),
    annotationQueues: {
      byId: {
        useQuery: () => ({
          data: { scoreConfigs: [{ id: "first-config" }] },
          isError: mocks.refetchFailed,
          isFetchedAfterMount: mocks.fetchedAfterMount,
        }),
      },
      update: {
        useMutation: () => ({ mutate: mocks.update, isPending: false }),
      },
    },
    scoreConfigs: {
      all: {
        useQuery: () => ({
          data: { configs: [] },
          isError: mocks.refetchFailed,
          isFetchedAfterMount: mocks.fetchedAfterMount,
        }),
      },
    },
    annotationQueueItems: {
      itemsByQueueId: { useQuery: () => ({ data: { totalItems: 0 } }) },
    },
  },
}));

it("waits for initial refresh and retains the selected config draft after background read failures", () => {
  const content = () => (
    <LayerProvider>
      <TooltipProvider>
        <AnnotationQueueScoreConfigsDialogController
          projectId="project"
          queueId="queue"
        >
          {({ openDialog }) => <button onClick={openDialog}>Open</button>}
        </AnnotationQueueScoreConfigsDialogController>
      </TooltipProvider>
    </LayerProvider>
  );
  const view = render(content());
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(
    screen.queryByRole("button", { name: "Add existing config" }),
  ).not.toBeInTheDocument();
  mocks.fetchedAfterMount = true;
  view.rerender(content());
  fireEvent.click(screen.getByRole("button", { name: "Add existing config" }));
  expect(screen.getByLabelText("Selected config IDs")).toHaveTextContent(
    "first-config,second-config",
  );

  mocks.refetchFailed = true;
  view.rerender(content());
  expect(screen.getByLabelText("Selected config IDs")).toHaveTextContent(
    "first-config,second-config",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save score configs" }));
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    queueId: "queue",
    scoreConfigIds: ["first-config", "second-config"],
  });
});
