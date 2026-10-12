import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("captures the displayed error ID without toast content", async () => {
    const props = {
      error: "Sensitive error title",
      description: "Sensitive customer-controlled details",
      type: "ERROR" as const,
      dismissToast: vi.fn(),
      toast: "toast-1",
      source: "trpc" as const,
      path: "traces.byId",
      traceId: "0123456789abcdef",
      analytics: {
        errorOrigin: "backend" as const,
        errorCategory: "internal" as const,
        trpcCode: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
      },
    };

    const view = render(<ErrorNotification {...props} />);

    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
        toastType: "ERROR",
        source: "trpc",
        path: "traces.byId",
        hasErrorId: true,
        errorId: props.traceId,
        errorOrigin: "backend",
        errorCategory: "internal",
        trpcCode: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
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
        errorOrigin: "unknown",
        errorCategory: "unknown",
      });
    });
    expect(mocks.capture.mock.calls[0]?.[1]).not.toHaveProperty("errorId");
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
        errorOrigin: "unknown",
        errorCategory: "unknown",
      });
    });
  });

  it("uses the same bounded dimensions for error interactions", async () => {
    const dismissToast = vi.fn();
    render(
      <ErrorNotification
        error="Sensitive error"
        description="Sensitive details"
        type="ERROR"
        dismissToast={dismissToast}
        toast="toast-4"
        analytics={{
          errorOrigin: "frontend",
          errorCategory: "user_input",
          operation: "form.submit",
        }}
      />,
    );

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", { name: "Report issue to Langfuse team" }),
    );

    expect(mocks.capture).toHaveBeenLastCalledWith("toast:report_issue", {
      toastType: "ERROR",
      source: "application",
      errorOrigin: "frontend",
      errorCategory: "user_input",
      operation: "form.submit",
    });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.capture).toHaveBeenLastCalledWith("toast:dismiss", {
      toastType: "ERROR",
      source: "application",
      errorOrigin: "frontend",
      errorCategory: "user_input",
      operation: "form.submit",
    });
    expect(dismissToast).toHaveBeenCalledWith("toast-4");
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("Sensitive");
  });
});
