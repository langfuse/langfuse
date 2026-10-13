import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { vi } from "vitest";
import { AnnotationQueueFormDialogController } from "./AnnotationQueueFormDialogController";

const { create, update, assign, notify, draft } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  assign: vi.fn(),
  notify: vi.fn(),
  draft: {
    name: "Initial name",
    description: "Initial description",
    scoreConfigIds: ["first-config"],
    newAssignmentUserIds: ["reviewer"],
  },
}));

vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/notifications", () => ({ showErrorToast: notify }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./AnnotationQueueFormDialogContent", () => ({
  AnnotationQueueFormDialogContent: ({
    onSubmit,
    isSubmitting,
  }: {
    onSubmit: (data: typeof draft) => void;
    isSubmitting: boolean;
  }) => (
    <button disabled={isSubmitting} onClick={() => onSubmit({ ...draft })}>
      Save
    </button>
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      annotationQueues: { invalidate: vi.fn() },
      annotationQueueAssignments: { invalidate: vi.fn() },
    }),
    annotationQueues: {
      byId: { useQuery: () => ({ data: undefined }) },
      allNamesAndIds: { useQuery: () => ({ data: [] }) },
      create: { useMutation: () => ({ mutateAsync: create }) },
      update: { useMutation: () => ({ mutateAsync: update }) },
    },
    annotationQueueAssignments: {
      createMany: { useMutation: () => ({ mutateAsync: assign }) },
    },
    scoreConfigs: { all: { useQuery: () => ({ data: { configs: [] } }) } },
  },
}));

it("saves edited queue fields when retrying a failed assignment without duplicating the queue", async () => {
  create.mockResolvedValue({ id: "created-queue" });
  update.mockResolvedValue(undefined);
  assign
    .mockRejectedValueOnce(new Error("Assignment unavailable"))
    .mockResolvedValue(undefined);
  const onSuccess = vi.fn();
  render(
    <AnnotationQueueFormDialogController
      projectId="project"
      mode="create"
      onSuccess={onSuccess}
    >
      {({ openDialog }) => <button onClick={openDialog}>Open</button>}
    </AnnotationQueueFormDialogController>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
  );
  Object.assign(draft, {
    name: "Edited name",
    description: "Edited description",
    scoreConfigIds: ["second-config"],
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("created-queue"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({
    projectId: "project",
    queueId: "created-queue",
    name: "Edited name",
    description: "Edited description",
    scoreConfigIds: ["second-config"],
  });
  expect(assign).toHaveBeenCalledTimes(2);
});
