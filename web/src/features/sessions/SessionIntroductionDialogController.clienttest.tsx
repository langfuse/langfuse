import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import {
  SESSION_INTRODUCTION_STORAGE_KEY,
  SessionIntroductionDialogController,
} from "@/src/features/sessions/SessionIntroductionDialogController";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => capture,
}));

function Introduction() {
  return (
    <LayerProvider>
      <SessionIntroductionDialogController
        initialState={
          localStorage.getItem(SESSION_INTRODUCTION_STORAGE_KEY) === "true"
            ? "dismissed"
            : "first-visit"
        }
        onDismiss={vi.fn()}
      >
        {({ showBadge, openDialog }) => (
          <DropdownMenu
            title="Session actions"
            items={[
              {
                type: "item",
                id: "session-introduction",
                title: "What's new",
                showNewIndicator: showBadge,
                onClick: openDialog,
              },
            ]}
          >
            {({ getTriggerProps }) => (
              <button type="button" {...getTriggerProps()}>
                Session actions
              </button>
            )}
          </DropdownMenu>
        )}
      </SessionIntroductionDialogController>
    </LayerProvider>
  );
}

describe("SessionIntroductionDialogController", () => {
  beforeEach(() => {
    localStorage.clear();
    capture.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("introduces the timeline once and allows reopening from the actions menu", async () => {
    const { unmount } = render(<Introduction />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/one continuous conversation transcript/),
    ).toBeInTheDocument();
    expect(screen.getByText(/new conversation sidebar/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Provide feedback" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/langfuse/langfuse/discussions",
    );
    fireEvent.click(screen.getByRole("button", { name: "Got it!" }));
    expect(localStorage.getItem(SESSION_INTRODUCTION_STORAGE_KEY)).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    unmount();
    render(<Introduction />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Session actions" }));
    fireEvent.click(await screen.findByRole("button", { name: /What's new/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("persists dismissal with the close button", () => {
    render(<Introduction />);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(localStorage.getItem(SESSION_INTRODUCTION_STORAGE_KEY)).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tracks showing, dismissing, and each button click", async () => {
    render(<Introduction />);
    expect(capture).toHaveBeenCalledWith("session_introduction:shown", {
      source: "first_visit",
    });
    fireEvent.click(screen.getByRole("link", { name: "Provide feedback" }));
    expect(capture).toHaveBeenCalledWith(
      "session_introduction:button_clicked",
      {
        button: "provide_feedback",
      },
    );
    expect(capture).not.toHaveBeenCalledWith(
      "session_introduction:dismissed",
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Got it!" }));
    expect(capture).toHaveBeenCalledWith(
      "session_introduction:button_clicked",
      {
        button: "got_it",
      },
    );
    expect(capture).toHaveBeenCalledWith("session_introduction:dismissed", {
      source: "first_visit",
    });
    fireEvent.click(screen.getByRole("button", { name: "Session actions" }));
    fireEvent.click(await screen.findByRole("button", { name: /What's new/ }));
    expect(capture).toHaveBeenCalledWith(
      "session_introduction:button_clicked",
      {
        button: "reopen",
      },
    );
    expect(capture).toHaveBeenCalledWith("session_introduction:shown", {
      source: "reopen",
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(capture).toHaveBeenCalledWith("session_introduction:dismissed", {
      source: "reopen",
    });
    expect(
      capture.mock.calls.filter(
        ([event]) => event === "session_introduction:shown",
      ),
    ).toHaveLength(2);
  });
});
