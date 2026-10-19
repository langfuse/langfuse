import {
  act,
  fireEvent,
  render as renderWithTestingLibrary,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { AnnotationQueuesItem } from "./AnnotationQueuesItem";

function render(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = renderWithTestingLibrary(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...rendered, queryClient: client };
}

const {
  router,
  fetchNext,
  complete,
  refreshItems,
  refreshQueue,
  queueFields,
  items,
} = vi.hoisted(() => ({
  router: {
    isReady: true,
    pathname: "/project/[projectId]/annotation-queues/[queueId]/items/[itemId]",
    query: {} as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn(),
  },
  fetchNext: vi.fn(),
  complete: vi.fn(),
  refreshItems: vi.fn(),
  refreshQueue: vi.fn(),
  queueFields: { configs: [] as { id: string; name: string }[] },
  items: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));
vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/src/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));
vi.mock("@/src/features/scores", () => ({
  hasModifier: () => false,
  isCompleteShortcut: () => false,
  isInteractiveTarget: () => false,
  isOpenDialogPresent: () => false,
  isTypingTarget: () => false,
}));
vi.mock("@/src/utils/api", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    api: {
      useUtils: () => ({
        annotationQueueItems: {
          invalidate: refreshItems,
          byId: {
            fetch: ({ itemId }: { itemId: string }) =>
              Promise.resolve(items.get(itemId) ?? null),
            setData: (
              { itemId }: { itemId: string },
              item: Record<string, unknown>,
            ) => items.set(itemId, item),
          },
        },
      }),
      annotationQueues: {
        byId: {
          useQuery: (
            input: { projectId: string; queueId: string },
            options: {
              enabled?: boolean;
              refetchOnMount?: boolean | "always";
              refetchOnWindowFocus?: boolean;
              refetchOnReconnect?: boolean;
            },
          ) =>
            useQuery({
              queryKey: ["annotation-queues", input.projectId, input.queueId],
              queryFn: () => refreshQueue(input),
              initialData: {
                name: "Review queue",
                scoreConfigs: [...queueFields.configs],
              },
              ...options,
            }),
        },
        fetchAndLockNext: {
          useMutation: () => ({ mutateAsync: fetchNext, isPending: false }),
        },
      },
      annotationQueueItems: {
        byId: {
          useQuery: ({ itemId }: { itemId: string }) => ({
            data: items.get(itemId),
            isPending: false,
          }),
        },
        unseenPendingItemCountByQueueId: {
          useQuery: ({ seenItemIds }: { seenItemIds: string[] }) => ({
            data: Math.max(2 - seenItemIds.length, 0),
            isPending: false,
          }),
        },
        complete: {
          useMutation: () => ({ mutateAsync: complete, isPending: false }),
        },
      },
    },
  };
});
vi.mock("./shared/hooks/useAnnotationObjectData", () => ({
  useAnnotationObjectData: (item: { objectId: string } | null) => ({
    data: item ? { id: item.objectId } : undefined,
    isLoading: false,
  }),
}));
vi.mock("@/src/features/traces", () => ({
  Trace: () => <p>Trace loaded</p>,
}));
vi.mock("./shared/AnnotationDrawerSection", () => ({
  AnnotationDrawerSection: ({
    item,
    configs,
  }: {
    item: { objectId: string };
    configs: { name: string }[];
  }) => (
    <>
      <p>{item.objectId}</p>
      <output aria-label="Queue fields">
        {configs.map((config) => config.name).join(", ")}
      </output>
      <input aria-label="Comment draft" />
    </>
  ),
}));
vi.mock("./shared/AnnotationProcessingLayout", () => ({
  AnnotationProcessingLayout: ({
    leftPanel,
    rightPanel,
  }: {
    leftPanel: ReactNode;
    rightPanel: ReactNode;
  }) => (
    <>
      {leftPanel}
      {rightPanel}
    </>
  ),
}));
vi.mock("./processors/SessionAnnotationProcessor", () => ({
  SessionAnnotationProcessor: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  router.push.mockReset();
  router.replace.mockReset();
  fetchNext.mockReset();
  complete.mockReset();
  refreshItems.mockReset();
  refreshQueue.mockReset();
  queueFields.configs = [];
  refreshQueue.mockImplementation(() =>
    Promise.resolve({
      name: "Review queue",
      scoreConfigs: [...queueFields.configs],
    }),
  );
  items.clear();
  for (const queueId of ["first", "second"]) {
    items.set(`${queueId}-item`, {
      id: `${queueId}-item`,
      queueId,
      projectId: "project",
      objectId: `${queueId}-observation`,
      objectType: "OBSERVATION",
      parentTraceId: `${queueId}-trace`,
      status: "PENDING",
      lockedByUser: { name: "Reviewer" },
    });
  }
  router.query = {};
  router.isReady = true;
  router.push.mockImplementation(
    ({
      pathname,
      query,
    }: {
      pathname: string;
      query?: Record<string, string>;
    }) => {
      router.query = { ...query, itemId: pathname.split("/").at(-1)! };
      return Promise.resolve(true);
    },
  );
  router.replace.mockImplementation(
    ({ query }: { query: Record<string, string> }) => {
      router.query = query;
      return Promise.resolve(true);
    },
  );
  fetchNext.mockImplementation(({ queueId }: { queueId: string }) =>
    Promise.resolve(items.get(`${queueId}-item`)),
  );
  complete.mockResolvedValue(undefined);
  refreshItems.mockResolvedValue(undefined);
});

it.each(["success", "failure"])(
  "waits for cached queue mount refresh %s before editing and preserves drafts on later invalidation",
  async (result) => {
    queueFields.configs = [{ id: "cached", name: "Cached field" }];
    let resolveRefresh!: (value: unknown) => void;
    let rejectRefresh!: (error: Error) => void;
    refreshQueue.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          resolveRefresh = resolve;
          rejectRefresh = reject;
        }),
    );
    const { queryClient } = render(
      <AnnotationQueuesItem projectId="project" annotationQueueId="first" />,
    );
    await waitFor(() => expect(refreshQueue).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("textbox", { name: "Comment draft" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      if (result === "failure")
        rejectRefresh(new Error("Queue refresh unavailable"));
      else
        resolveRefresh({
          name: "Review queue",
          scoreConfigs: [{ id: "refreshed", name: "Refreshed field" }],
        });
    });
    const input = await screen.findByRole("textbox", { name: "Comment draft" });
    expect(screen.getByLabelText("Queue fields")).toHaveTextContent(
      result === "failure" ? "Cached field" : "Refreshed field",
    );
    fireEvent.change(input, { target: { value: "Unsent review" } });
    refreshQueue.mockResolvedValueOnce({
      name: "Review queue",
      scoreConfigs: [{ id: "later", name: "Later field" }],
    });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["annotation-queues", "project", "first"],
      });
    });
    expect(screen.getByRole("textbox", { name: "Comment draft" })).toBe(input);
    expect(input).toHaveValue("Unsent review");
  },
);

it.each(["refresh", "advance", "navigation"])(
  "retains completion and retries a failed %s without completing twice",
  async (phase) => {
    fetchNext.mockResolvedValueOnce(items.get("first-item"));
    if (phase === "refresh")
      refreshItems.mockRejectedValueOnce(new Error("Refresh failed"));
    else if (phase === "advance")
      fetchNext.mockRejectedValueOnce(new Error("Next item failed"));
    fetchNext.mockResolvedValueOnce({
      ...items.get("second-item"),
      queueId: "first",
    });
    render(
      <AnnotationQueuesItem projectId="project" annotationQueueId="first" />,
    );
    expect(await screen.findByText("first-observation")).toBeVisible();
    if (phase === "navigation")
      router.push.mockRejectedValueOnce(new Error("Navigation failed"));
    fireEvent.click(screen.getByRole("button", { name: /Mark Completed/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Item completed",
    );
    expect(screen.getByText("Completed", { exact: true })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Mark Completed/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("second-observation")).toBeVisible();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(fetchNext).toHaveBeenCalledTimes(phase === "advance" ? 3 : 2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  },
);

it("locks only one starting item during Strict Mode replay", async () => {
  render(
    <StrictMode>
      <AnnotationQueuesItem projectId="project" annotationQueueId="first" />
    </StrictMode>,
  );
  expect(await screen.findByText("first-observation")).toBeVisible();
  expect(fetchNext).toHaveBeenCalledTimes(1);
});

it("serializes skip and completion transitions and keeps back navigation in the run", async () => {
  let resolveNext!: (value: Record<string, unknown>) => void;
  const nextItem = { ...items.get("second-item"), queueId: "first" };
  fetchNext
    .mockResolvedValueOnce(items.get("first-item"))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
  render(
    <AnnotationQueuesItem projectId="project" annotationQueueId="first" />,
  );
  expect(await screen.findByText("first-observation")).toBeVisible();
  const next = screen.getByRole("button", { name: "Skip to next item" });
  fireEvent.click(next);
  fireEvent.click(next);
  expect(fetchNext).toHaveBeenCalledTimes(2);
  resolveNext(nextItem);
  expect(await screen.findByText("second-observation")).toBeVisible();
  expect(router.query.itemId).toBe("second-item");
  fireEvent.click(screen.getByRole("button", { name: "Previous item" }));
  expect(await screen.findByText("first-observation")).toBeVisible();
  expect(router.query.itemId).toBe("first-item");
  fireEvent.click(screen.getByRole("button", { name: /Mark Completed/ }));
  expect(await screen.findByText("second-observation")).toBeVisible();
  expect(complete).toHaveBeenCalledWith({
    itemId: "first-item",
    projectId: "project",
  });
  expect(fetchNext).toHaveBeenCalledTimes(2);
});

it("starts a fresh processing run when the queue changes", async () => {
  const { rerender } = render(
    <AnnotationQueuesItem projectId="project" annotationQueueId="first" />,
  );
  expect(await screen.findByText("first-observation")).toBeVisible();
  rerender(
    <AnnotationQueuesItem projectId="project" annotationQueueId="second" />,
  );
  expect(await screen.findByText("second-observation")).toBeVisible();
  expect(router.query.observation).toBe("second-observation");
});

it("preserves the current draft during a failed next-item transition", async () => {
  let rejectNext!: (error: Error) => void;
  fetchNext
    .mockResolvedValueOnce(items.get("first-item"))
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectNext = reject;
        }),
    );
  render(
    <AnnotationQueuesItem projectId="project" annotationQueueId="first" />,
  );
  expect(await screen.findByText("first-observation")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Comment draft" }), {
    target: { value: "Unsent review" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Skip to next item" }));
  expect(screen.getByRole("textbox", { name: "Comment draft" })).toHaveValue(
    "Unsent review",
  );
  expect(
    screen.getByRole("button", { name: "Skip to next item" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: /Mark Completed/ })).toBeDisabled();
  await act(async () => {
    rejectNext(new Error("Queue unavailable"));
  });
  expect(screen.getByRole("textbox", { name: "Comment draft" })).toHaveValue(
    "Unsent review",
  );
  expect(
    screen.getByRole("button", { name: "Skip to next item" }),
  ).toBeEnabled();
});

it("ignores a next-item response after leaving its queue", async () => {
  let resolveNext!: (value: Record<string, unknown>) => void;
  fetchNext
    .mockResolvedValueOnce(items.get("first-item"))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
    );
  const { rerender } = render(
    <AnnotationQueuesItem projectId="project" annotationQueueId="first" />,
  );
  expect(await screen.findByText("first-observation")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Skip to next item" }));
  rerender(
    <AnnotationQueuesItem projectId="project" annotationQueueId="second" />,
  );
  expect(await screen.findByText("second-observation")).toBeVisible();
  router.push.mockClear();
  await act(async () => {
    resolveNext({ ...items.get("first-item"), id: "late-first-item" });
  });
  expect(router.push).not.toHaveBeenCalled();
});

it("selects a direct observation item once and preserves reviewer selection on refetch", async () => {
  router.isReady = false;
  const view = () => (
    <AnnotationQueuesItem
      projectId="project"
      annotationQueueId="first"
      itemId="first-item"
    />
  );
  const { rerender } = render(view());
  await act(() => Promise.resolve());
  expect(router.push).not.toHaveBeenCalled();
  router.isReady = true;
  router.query = { itemId: "first-item", singleItem: "true" };
  rerender(view());
  await waitFor(() =>
    expect(router.query.observation).toBe("first-observation"),
  );
  router.query.observation = "reviewer-selected-sibling";
  items.set("first-item", { ...items.get("first-item") });
  rerender(view());
  expect(router.query.observation).toBe("reviewer-selected-sibling");
  delete router.query.observation;
  items.set("first-item", { ...items.get("first-item") });
  rerender(view());
  expect(router.query.observation).toBeUndefined();
});
