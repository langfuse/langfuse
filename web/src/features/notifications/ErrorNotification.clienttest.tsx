import { render, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ErrorNotification } from "@/src/features/notifications/ErrorNotification";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  copy: vi.fn().mockResolvedValue(undefined),
  setMigrationPanelOpen: vi.fn(),
  setSupportDrawerOpen: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/support-chat", () => ({
  useSupportDrawer: () => ({ setOpen: mocks.setSupportDrawerOpen }),
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanelProvider", () => ({
  useV4MigrationPanel: () => ({ setOpen: mocks.setMigrationPanelOpen }),
}));

vi.mock("@/src/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: mocks.copy, isCopied: false }),
}));

describe("ErrorNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures one metadata-only shown event for a rendered error toast", async () => {
    const props = {
      error: "Sensitive error title",
      description: "Sensitive customer-controlled details",
      type: "ERROR" as const,
      dismissToast: vi.fn(),
      toast: "toast-1",
      source: "trpc" as const,
      path: "traces.byId",
      traceId: "0123456789abcdef",
    };

    const view = render(<ErrorNotification {...props} />);

    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
        toastType: "ERROR",
        source: "trpc",
        path: "traces.byId",
        hasErrorId: true,
      });
    });

    view.rerender(
      <ErrorNotification
        {...props}
        type="WARNING"
        path="scores.byId"
        traceId={undefined}
      />,
    );

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.capture.mock.calls[0]?.[1])).not.toContain(
      "Sensitive",
    );
    expect(JSON.stringify(mocks.capture.mock.calls[0]?.[1])).not.toContain(
      props.traceId,
    );
  });

  it("classifies a local warning without inventing tRPC metadata", async () => {
    render(
      <ErrorNotification
        error="Warning"
        description="Try again"
        type="WARNING"
        dismissToast={vi.fn()}
        toast="toast-2"
      />,
    );

    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
        toastType: "WARNING",
        source: "application",
        hasErrorId: false,
      });
    });
  });

  it("classifies a pathless tRPC warning by its explicit source", async () => {
    render(
      <ErrorNotification
        error="Unexpected Response"
        description="Try again"
        type="WARNING"
        source="trpc"
        dismissToast={vi.fn()}
        toast="toast-3"
      />,
    );

    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
        toastType: "WARNING",
        source: "trpc",
        hasErrorId: false,
      });
    });
  });
});
