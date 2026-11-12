import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { vi } from "vitest";
import {
  DetailPageListsProvider,
  useDetailPageLists,
} from "@/src/features/navigate-detail-pages/DetailPageListsProvider";
import {
  AnnotationQueueItemNav,
  annotationQueueItemListKey,
} from "./AnnotationQueueItemNav";

const { router } = vi.hoisted(() => ({
  router: {
    query: {} as Record<string, string | undefined>,
    push: vi.fn(),
  },
}));

vi.mock("next/router", () => ({ useRouter: () => router }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const orderedIds = ["item-a", "item-b", "item-c"];

function SeedQueueList() {
  const { setDetailPageList } = useDetailPageLists();
  useEffect(() => {
    setDetailPageList(
      annotationQueueItemListKey("queue"),
      orderedIds.map((id) => ({ id })),
    );
  }, [setDetailPageList]);
  return null;
}

function renderNav(itemId: string) {
  return render(
    <DetailPageListsProvider>
      <SeedQueueList />
      <AnnotationQueueItemNav
        projectId="project"
        queueId="queue"
        itemId={itemId}
      />
    </DetailPageListsProvider>,
  );
}

function itemPath(itemId: string) {
  return `/project/project/annotation-queues/queue/items/${itemId}?singleItem=true`;
}

it("moves between the listed queue items and disables the ends", async () => {
  const view = renderNav("item-a");
  const previous = await screen.findByRole("button", { name: "Navigate up" });
  const next = screen.getByRole("button", { name: "Navigate down" });
  expect(previous).toBeDisabled();
  expect(next).toBeEnabled();

  fireEvent.click(next);
  expect(router.push).toHaveBeenCalledWith(itemPath("item-b"));

  router.push.mockClear();
  view.rerender(
    <DetailPageListsProvider>
      <SeedQueueList />
      <AnnotationQueueItemNav
        projectId="project"
        queueId="queue"
        itemId="item-b"
      />
    </DetailPageListsProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Navigate up" }));
  expect(router.push).toHaveBeenCalledWith(itemPath("item-a"));
  router.push.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Navigate down" }));
  expect(router.push).toHaveBeenCalledWith(itemPath("item-c"));

  router.push.mockClear();
  view.rerender(
    <DetailPageListsProvider>
      <SeedQueueList />
      <AnnotationQueueItemNav
        projectId="project"
        queueId="queue"
        itemId="item-c"
      />
    </DetailPageListsProvider>,
  );
  expect(
    await screen.findByRole("button", { name: "Navigate down" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Navigate up" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Navigate up" }));
  expect(router.push).toHaveBeenCalledWith(itemPath("item-b"));
});

it("does not leave an open dialog on J or K", async () => {
  router.push.mockClear();
  renderNav("item-b");
  await screen.findByRole("button", { name: "Navigate down" });

  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.appendChild(dialog);

  fireEvent.keyDown(window, { key: "j" });
  fireEvent.keyDown(window, { key: "k" });
  expect(router.push).not.toHaveBeenCalled();

  dialog.remove();
  fireEvent.keyDown(window, { key: "j" });
  expect(router.push).toHaveBeenCalledWith(itemPath("item-c"));
});
