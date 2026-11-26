import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { vi } from "vitest";
import { TraceDetailActions } from "./TraceDetailActions";
import { type TraceTranscriptDialogController } from "./TraceTranscriptDialogController";
import { type TopicsTranscriptDialogController } from "./TopicsTranscriptDialogController";
import { type DeleteTraceDialogController } from "./DeleteTraceDialogController";
import { type ConnectedDetailHeaderActionsMenuController } from "./ConnectedDetailHeaderActionsMenuController";

const mocks = vi.hoisted(() => ({
  aggregation: "trace",
  sessionActions: vi.fn(() => [
    { id: "session-options", type: "dropdown", label: "Session actions" },
  ]),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { aggregation: mocks.aggregation } }),
}));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/auth/hooks", () => ({
  useIsAuthenticatedAndProjectMember: () => true,
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => true,
}));
vi.mock("@/src/features/traces/hooks/useSessionScopeActions", () => ({
  useSessionScopeActions: mocks.sessionActions,
}));
vi.mock("@/src/components/useShareMenuItems", () => ({
  useShareMenuItems: () => [],
}));
vi.mock("@/src/features/traces/hooks/useDownloadTraceAsJson", () => ({
  useDownloadTraceAsJson: () => [vi.fn(), false],
}));
vi.mock("./TraceTranscriptDialogController", () => ({
  TraceTranscriptDialogController: ({
    children,
  }: ComponentProps<typeof TraceTranscriptDialogController>) =>
    children({ openDialog: vi.fn() }),
}));
vi.mock("./TopicsTranscriptDialogController", () => ({
  TopicsTranscriptDialogController: ({
    children,
  }: ComponentProps<typeof TopicsTranscriptDialogController>) =>
    children({ openDialog: vi.fn() }),
}));
vi.mock("./DeleteTraceDialogController", () => ({
  DeleteTraceDialogController: ({
    children,
  }: ComponentProps<typeof DeleteTraceDialogController>) =>
    children({ disabled: undefined, openDialog: vi.fn() }),
}));
vi.mock("./ConnectedDetailHeaderActionsMenuController", () => ({
  ConnectedDetailHeaderActionsMenuController: ({
    renderMenu,
  }: ComponentProps<typeof ConnectedDetailHeaderActionsMenuController>) =>
    renderMenu?.([]),
}));

function Draft() {
  const [text, setText] = useState("");
  return (
    <input
      aria-label="Draft"
      value={text}
      onChange={(event) => setText(event.target.value)}
    />
  );
}

it.each(["fullscreen", "peek"] as const)(
  "preserves child state when switching scopes in %s",
  (traceContext) => {
    mocks.aggregation = "trace";
    const trace: NonNullable<
      ComponentProps<typeof TraceDetailActions>["trace"]
    > = {
      id: "trace-1",
      projectId: "project-1",
      sessionId: "session-1",
      name: null,
      timestamp: new Date("2026-01-01"),
      environment: "default",
      tags: [],
      bookmarked: false,
      public: false,
      release: null,
      version: null,
      input: null,
      output: null,
      metadata: null,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      userId: null,
      observations: [],
      scores: [],
      corrections: [],
    };
    const view = () => (
      <TraceDetailActions trace={trace} traceContext={traceContext}>
        {(actions) => (
          <>
            <span>
              {actions
                .map((action) => (action.type === "custom" ? "" : action.label))
                .join(", ")}
            </span>
            <Draft />
          </>
        )}
      </TraceDetailActions>
    );
    const { rerender } = render(view());
    const draft = screen.getByRole("textbox", { name: "Draft" });
    fireEvent.change(draft, { target: { value: "Unsaved draft" } });

    for (const aggregation of ["session", "trace", "session"]) {
      mocks.aggregation = aggregation;
      rerender(view());
      expect(screen.getByRole("textbox", { name: "Draft" })).toBe(draft);
      expect(draft).toHaveValue("Unsaved draft");
      expect(
        screen.getByText(
          aggregation === "session"
            ? "Session actions"
            : "Download JSON, More actions",
        ),
      ).toBeInTheDocument();
    }
  },
);
