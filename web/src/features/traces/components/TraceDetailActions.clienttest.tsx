import { render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { vi } from "vitest";
import { TraceDetailActions } from "./TraceDetailActions";

const mocks = vi.hoisted(() => ({
  aggregation: "session",
  enabled: true,
  isV4: true,
  isMember: true,
  session: { data: { public: true } as { public: boolean } | undefined },
  sessionMenu: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { aggregation: mocks.aggregation } }),
}));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: mocks.isV4 }),
}));
vi.mock("@/src/features/auth/hooks", () => ({
  useIsAuthenticatedAndProjectMember: () => mocks.isMember,
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => mocks.enabled,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    sessions: {
      byIdWithScoresFromEvents: { useQuery: () => mocks.session },
    },
  },
}));
vi.mock("@/src/features/sessions/useSessionHeaderMenuItems", () => ({
  useSessionHeaderMenuItems: mocks.sessionMenu,
}));
vi.mock(
  "@/src/features/traces/components/TraceTranscriptDialogController",
  () => ({
    TraceTranscriptDialogController: () => <div>Trace actions</div>,
  }),
);
vi.mock(
  "@/src/features/traces/components/TopicsTranscriptDialogController",
  () => ({ TopicsTranscriptDialogController: () => null }),
);
vi.mock(
  "@/src/features/traces/components/DetailHeaderActionsMenuController",
  () => ({ ConnectedDetailHeaderActionsMenuController: () => null }),
);
vi.mock("@/src/features/traces/components/DeleteTraceDialogController", () => ({
  DeleteTraceDialogController: () => null,
}));
vi.mock("@/src/features/traces/hooks/useDownloadTraceAsJson", () => ({
  useDownloadTraceAsJson: vi.fn(),
}));
vi.mock("@/src/features/web-callouts/components/useWebCalloutAction", () => ({
  useWebCalloutAction: () => null,
}));

describe("TraceDetailActions session scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.aggregation = "session";
    mocks.enabled = true;
    mocks.isV4 = true;
    mocks.isMember = true;
    mocks.session.data = { public: true };
    mocks.sessionMenu.mockReturnValue([
      { id: "copy-session-id", type: "item", title: "Copy session ID" },
    ]);
  });

  function renderActions(
    overrides: Partial<ComponentProps<typeof TraceDetailActions>> = {},
  ) {
    // Only scope resolution reads the trace in these tests.
    const trace = {
      id: "trace-1",
      projectId: "project-1",
      sessionId: "session-1",
    } as NonNullable<ComponentProps<typeof TraceDetailActions>["trace"]>;
    return render(
      <TraceDetailActions trace={trace} traceContext="peek" {...overrides}>
        {(actions) =>
          actions.map((action) => {
            if (action.type !== "button" && action.type !== "dropdown")
              return null;
            return (
              <div key={action.id}>
                <button disabled={action.disabled}>{action.label}</button>
                {action.type === "dropdown" &&
                  action.items.map((item) =>
                    item.type === "item" ? (
                      <span key={item.id}>{item.title}</span>
                    ) : null,
                  )}
              </div>
            );
          })
        }
      </TraceDetailActions>,
    );
  }

  it("uses session sharing and ID actions, with download disabled and no trace workflows", () => {
    renderActions();
    expect(mocks.sessionMenu).toHaveBeenCalledWith({
      projectId: "project-1",
      sessionId: "session-1",
      isPublic: true,
      shareUrl: "/project/project-1/sessions/session-1",
    });
    expect(screen.getByText("Copy session ID")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download JSON" }),
    ).toBeDisabled();
    expect(screen.queryByText("Trace actions")).not.toBeInTheDocument();
  });

  it("disables session actions until the public state loads", () => {
    mocks.session.data = undefined;
    renderActions();
    expect(
      screen.getByRole("button", { name: "Session actions" }),
    ).toBeDisabled();
  });

  it("disables session actions while showing placeholder data", () => {
    renderActions({ isPlaceholderData: true });
    expect(
      screen.getByRole("button", { name: "Session actions" }),
    ).toBeDisabled();
  });

  it.each(["trace", "feature disabled", "v3", "non-member"])(
    "preserves trace actions for %s",
    (context) => {
      if (context === "trace") mocks.aggregation = "trace";
      if (context === "feature disabled") mocks.enabled = false;
      if (context === "v3") mocks.isV4 = false;
      if (context === "non-member") mocks.isMember = false;
      renderActions();
      expect(screen.getByText("Trace actions")).toBeInTheDocument();
      expect(mocks.sessionMenu).not.toHaveBeenCalled();
    },
  );
});
