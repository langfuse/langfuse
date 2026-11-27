import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { PublicShareDialogController } from "@/src/features/sharing/components/PublicShareDialogController";

const { openInviteDialog, inviteController } = vi.hoisted(() => ({
  openInviteDialog: vi.fn(),
  inviteController: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock(
  "@/src/features/rbac/components/CreateProjectMemberDialogController",
  () => ({
    CreateProjectMemberDialogController: (props: {
      defaultOrgRole?: string;
      children: (control: {
        hasAccess: boolean;
        openDialog: () => void;
      }) => ReactNode;
    }) => {
      inviteController(props.defaultOrgRole);
      return props.children({ hasAccess: true, openDialog: openInviteDialog });
    },
  }),
);

const onConfirm = vi.fn();

function SharePage({ objectId = "trace-1" }: { objectId?: string }) {
  return (
    <LayerProvider>
      <PublicShareDialogController kind="trace" objectId={objectId}>
        {({ openShareDialog }) => (
          <button type="button" onClick={() => openShareDialog({ onConfirm })}>
            Make Public
          </button>
        )}
      </PublicShareDialogController>
    </LayerProvider>
  );
}

const confirmation = () =>
  screen.queryByRole("dialog", { name: "Make this trace public?" });
const makePublic = () =>
  fireEvent.click(screen.getByRole("button", { name: "Make Public" }));

describe("PublicShareDialogController", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("publishes only after the confirmation", () => {
    render(<SharePage />);
    makePublic();
    expect(confirmation()).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Make public" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("opens the invite dialog on Viewer and publishes nothing", () => {
    render(<SharePage />);
    makePublic();

    fireEvent.click(
      screen.getByRole("button", { name: "Invite viewers instead" }),
    );

    expect(openInviteDialog).toHaveBeenCalledOnce();
    expect(inviteController).toHaveBeenLastCalledWith("VIEWER");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirmation()).not.toBeInTheDocument();
  });

  it("opens again after a cancel and after leaving for the invite", () => {
    render(<SharePage />);
    makePublic();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    makePublic();
    expect(confirmation()).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Invite viewers instead" }),
    );

    makePublic();

    expect(confirmation()).toBeInTheDocument();
  });

  it("closes a confirmation when the page moves to another trace, and keeps it closed on the way back", () => {
    const { rerender } = render(<SharePage />);
    makePublic();

    rerender(<SharePage objectId="trace-2" />);
    expect(confirmation()).not.toBeInTheDocument();
    rerender(<SharePage />);

    expect(confirmation()).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
