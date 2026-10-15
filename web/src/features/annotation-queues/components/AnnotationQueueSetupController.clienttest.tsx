import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { AnnotationQueueSetupController } from "./AnnotationQueueSetupController";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  assign: vi.fn(),
  invalidateQueues: vi.fn(),
  invalidateAssignments: vi.fn(),
  capture: vi.fn(),
  refetch: vi.fn(),
  fetchedAfterMount: false,
  refetchFailed: false,
  queue: {
    id: "queue",
    name: "Initial name",
    description: "Initial description",
    scoreConfigs: [{ id: "first-config" }] as { id: string }[],
  },
}));

vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
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
      <button
        type="button"
        onClick={() => onChange([...value, "second-config"])}
      >
        Add existing config
      </button>
    </>
  ),
}));
vi.mock("./UserAssignmentSection", () => ({
  UserAssignmentSection: () => null,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      annotationQueues: { invalidate: mocks.invalidateQueues },
      annotationQueueAssignments: { invalidate: mocks.invalidateAssignments },
    }),
    annotationQueues: {
      byId: {
        useQuery: () => ({
          data: mocks.queue,
          isError: mocks.refetchFailed,
          isFetchedAfterMount: mocks.fetchedAfterMount,
          refetch: mocks.refetch,
        }),
      },
      allNamesAndIds: {
        useQuery: () => ({
          data: [{ id: "queue", name: "Initial name" }],
          isError: mocks.refetchFailed,
          refetch: mocks.refetch,
        }),
      },
      update: {
        useMutation: () => ({
          mutateAsync: mocks.update,
          isPending: false,
        }),
      },
    },
    scoreConfigs: {
      all: {
        useQuery: () => ({
          data: { configs: [] },
          isError: mocks.refetchFailed,
          isFetchedAfterMount: mocks.fetchedAfterMount,
          refetch: mocks.refetch,
        }),
      },
    },
    annotationQueueItems: {
      itemsByQueueId: { useQuery: () => ({ data: { totalItems: 0 } }) },
    },
    annotationQueueAssignments: {
      createMany: {
        useMutation: () => ({
          mutateAsync: mocks.assign,
          isPending: false,
        }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(undefined);
  mocks.assign.mockResolvedValue(undefined);
  mocks.fetchedAfterMount = false;
  mocks.refetchFailed = false;
  mocks.queue = {
    id: "queue",
    name: "Initial name",
    description: "Initial description",
    scoreConfigs: [{ id: "first-config" }],
  };
});

it("waits for initial refresh and retains drafts across panel unmounts and background query failures", async () => {
  const view = render(<SetupPanel />);
  expect(
    screen.queryByRole("button", { name: "Add existing config" }),
  ).not.toBeInTheDocument();

  mocks.fetchedAfterMount = true;
  view.rerender(<SetupPanel />);
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Draft name" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Description (optional)" }),
    { target: { value: "Draft description" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Add existing config" }));
  fireEvent.click(screen.getByRole("button", { name: "Hide setup" }));
  expect(
    screen.queryByRole("textbox", { name: "Name" }),
  ).not.toBeInTheDocument();

  mocks.queue = {
    ...mocks.queue,
    name: "Concurrent name",
    description: "Concurrent description",
  };
  mocks.refetchFailed = true;
  view.rerender(<SetupPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Show setup" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue(
    "Draft name",
  );
  expect(
    screen.getByRole("textbox", { name: "Description (optional)" }),
  ).toHaveValue("Draft description");
  expect(screen.getByLabelText("Selected config IDs")).toHaveTextContent(
    "first-config,second-config",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled(),
  );

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      projectId: "project",
      queueId: "queue",
      name: "Draft name",
      description: "Draft description",
      scoreConfigIds: ["first-config", "second-config"],
    }),
  );
});

it("saves only changed config IDs without overwriting concurrent queue metadata", async () => {
  mocks.fetchedAfterMount = true;
  const view = render(<SetupPanel />);
  fireEvent.click(screen.getByRole("button", { name: "Add existing config" }));
  mocks.queue = {
    ...mocks.queue,
    name: "Concurrent name",
    description: "Concurrent description",
  };
  view.rerender(<SetupPanel />);

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      projectId: "project",
      queueId: "queue",
      scoreConfigIds: ["first-config", "second-config"],
    }),
  );
  expect(mocks.assign).not.toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledWith(
    "annotation_queues:score_configs_saved",
    {
      scoreConfigCount: 2,
    },
  );
});

it("allows a metadata-only save for an initially unconfigured queue", async () => {
  mocks.fetchedAfterMount = true;
  mocks.queue.scoreConfigs = [];
  render(<SetupPanel />);
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Renamed empty queue" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled(),
  );

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      projectId: "project",
      queueId: "queue",
      name: "Renamed empty queue",
    }),
  );
  expect(mocks.capture).not.toHaveBeenCalled();
});

function SetupPanel() {
  const [visible, setVisible] = useState(true);
  return (
    <LayerProvider>
      <TooltipProvider>
        <button onClick={() => setVisible(!visible)}>
          {visible ? "Hide setup" : "Show setup"}
        </button>
        <AnnotationQueueSetupController
          projectId="project"
          queueId="queue"
          renderLayout={(content) => (visible ? content : null)}
        />
      </TooltipProvider>
    </LayerProvider>
  );
}
