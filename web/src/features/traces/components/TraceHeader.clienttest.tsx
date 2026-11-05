import { fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraceHeader } from "./TraceHeader";
import type { EntityDetailHeaderProps } from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";

const mocks = vi.hoisted(() => ({
  annotate: vi.fn(),
  comment: vi.fn(),
  annotationMode: false,
  stale: false,
}));

vi.mock("../contexts/TraceDataProvider", () => ({
  useTraceData: () => ({
    trace: {
      id: "trace",
      projectId: "project",
      sessionId: "session",
      tags: [],
      timestamp: new Date(0),
      environment: "default",
    },
    observations: [],
    mergedScores: [],
    serverScores: [],
    isPlaceholderData: mocks.stale,
  }),
}));
vi.mock("../contexts/ViewPreferencesProvider", () => ({
  useViewPreferences: () => ({ isAnnotationMode: mocks.annotationMode }),
}));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/auth/hooks", () => ({
  useIsAuthenticatedAndProjectMember: () => true,
}));
vi.mock("@/src/features/topics/trace/TraceTopicsHoverCard", () => ({
  useTraceTopicFacets: () => [],
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    sessions: {
      byIdWithScores: {
        useQuery: () => ({ data: { scores: [], environment: "session-env" } }),
      },
    },
    comments: {
      getCountByObjectId: {
        useQuery: () => ({
          data: new Map(),
          refetch: vi.fn().mockResolvedValue(undefined),
        }),
      },
    },
  },
}));
vi.mock("@/src/features/scores/components/AnnotateDrawerController", () => ({
  AnnotateDrawerController: ({
    children,
  }: {
    children: (control: {
      disabled: boolean;
      openDrawer: typeof mocks.annotate;
    }) => ReactNode;
  }) => children({ disabled: false, openDrawer: mocks.annotate }),
}));
vi.mock("@/src/features/comments/CommentDrawerController", () => ({
  CommentDrawerController: ({
    children,
  }: {
    children: (control: {
      disabled: boolean;
      openDrawer: typeof mocks.comment;
    }) => ReactNode;
  }) => children({ disabled: false, openDrawer: mocks.comment }),
}));
vi.mock("./ConnectedTraceObservationAddToDropdownMenuController", () => ({
  ConnectedTraceObservationAddToDropdownMenuController: ({
    renderMenu,
  }: {
    renderMenu: (items: []) => ReactNode;
  }) => renderMenu([]),
}));
vi.mock(
  "@/src/features/annotation-queues/components/AnnotationQueueSubmenuItemController",
  () => ({
    AnnotationQueueSubmenuItemController: ({
      children,
    }: {
      children: (control: {
        item: { id: string; type: "separator" };
      }) => ReactNode;
    }) => children({ item: { id: "queue", type: "separator" } }),
  }),
);
vi.mock(
  "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader",
  () => ({
    ObservabilityEntityDetailHeader: ({
      headerProps,
    }: {
      headerProps: EntityDetailHeaderProps;
    }) => (
      <>
        {(["toolbar", "menu"] as const).map((layout) => (
          <div key={layout} data-testid={layout}>
            {headerProps.actions?.map((action) =>
              action.type === "custom" ? (
                <div key={action.id}>
                  {action.render({
                    layout,
                    iconOnly: false,
                    closeMenu: vi.fn(),
                  })}
                </div>
              ) : (
                <button
                  key={action.id}
                  disabled={action.disabled}
                  onClick={
                    action.type === "button" ? action.onClick : undefined
                  }
                >
                  {action.label}
                </button>
              ),
            )}
          </div>
        ))}
      </>
    ),
  }),
);

describe("TraceHeader workflow actions", () => {
  it("keeps labeled workflow actions before caller-provided toolbar actions", () => {
    render(
      <TraceHeader
        header={{
          variant: "page",
          headerProps: {
            title: "Trace",
            itemType: "TRACE",
            actions: [
              {
                id: "previous",
                type: "custom",
                render: () => <button>Previous trace</button>,
              },
              {
                id: "download",
                type: "custom",
                render: () => <button>Download JSON</button>,
              },
            ],
          },
        }}
      />,
    );
    const buttons = within(screen.getByTestId("toolbar")).getAllByRole(
      "button",
    );
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Add to",
      "Annotate",
      "Comment",
      "Previous trace",
      "Download JSON",
    ]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.annotationMode = false;
    mocks.stale = false;
  });

  it.each(["TRACE", "SESSION"] as const)(
    "targets the displayed %s in toolbar and compact menu",
    (itemType) => {
      render(
        <TraceHeader
          header={{
            variant: "page",
            headerProps: { title: "Entity", itemType },
          }}
        />,
      );
      for (const button of screen.getAllByRole("button", { name: "Annotate" }))
        fireEvent.click(button);
      expect(mocks.annotate).toHaveBeenCalledTimes(2);
      expect(mocks.annotate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          scoreTarget:
            itemType === "SESSION"
              ? { type: "session", sessionId: "session" }
              : { type: "trace", traceId: "trace", observationId: undefined },
        }),
      );
      for (const button of screen.getAllByRole("button", { name: "Comment" }))
        fireEvent.click(button);
      expect(mocks.comment).toHaveBeenCalledTimes(2);
      expect(mocks.comment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          objectId: itemType === "SESSION" ? "session" : "trace",
          objectType: itemType,
        }),
      );
      expect(screen.getAllByRole("button", { name: "Add to" })).toHaveLength(2);
    },
  );

  it("hides Annotate in annotation mode", () => {
    mocks.annotationMode = true;
    render(
      <TraceHeader
        header={{
          variant: "page",
          headerProps: { title: "Trace", itemType: "TRACE" },
        }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Annotate" }),
    ).not.toBeInTheDocument();
  });

  it("disables workflow actions while showing a previous trace", () => {
    mocks.stale = true;
    render(
      <TraceHeader
        header={{
          variant: "page",
          headerProps: { title: "Trace", itemType: "TRACE" },
        }}
      />,
    );
    for (const name of ["Add to", "Annotate", "Comment"]) {
      for (const button of screen.getAllByRole("button", { name }))
        expect(button).toBeDisabled();
    }
  });
});
