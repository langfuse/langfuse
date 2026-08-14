import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnnotationQueueItemPage } from "./AnnotationQueueItemPage";

const mocks = vi.hoisted(() => ({
  fetchNext: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    push: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("./shared/hooks/useAnnotationQueueData", () => ({
  useAnnotationQueueData: () => ({ configs: [] }),
}));

vi.mock("./shared/hooks/useAnnotationObjectData", () => ({
  useAnnotationObjectData: () => ({
    data: null,
    isError: false,
    isLoading: false,
  }),
}));

vi.mock("./processors/TraceAnnotationProcessor", () => ({
  TraceAnnotationProcessor: () => null,
}));

vi.mock("./processors/SessionAnnotationProcessor", () => ({
  SessionAnnotationProcessor: () => null,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    annotationQueueItems: {
      byId: {
        useQuery: () => ({ data: null, isPending: false }),
      },
      unseenPendingItemCountByQueueId: {
        useQuery: () => ({ data: 0, isPending: false }),
      },
      complete: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
    },
    annotationQueues: {
      fetchAndLockNext: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: mocks.fetchNext,
        }),
      },
    },
    useUtils: () => ({
      annotationQueueItems: {
        invalidate: vi.fn(),
      },
    }),
  },
}));

describe("AnnotationQueueItemPage", () => {
  it("shows the completed queue as a formatted empty state", () => {
    render(
      <AnnotationQueueItemPage
        annotationQueueId="queue-1"
        projectId="project-1"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "All queue items processed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("There are no more items left to annotate."),
    ).toBeInTheDocument();
  });
});
