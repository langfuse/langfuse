import { StrictMode, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { expectTypeOf, vi } from "vitest";
import {
  dismissToast,
  showCustomToast,
  showToast,
} from "@/src/features/notifications";

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: vi.fn(),
}));
vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  dismiss: vi.fn(),
  custom: vi.fn<
    (render: (id: string | number) => unknown, options?: unknown) => string
  >(() => "custom-return-id"),
  error: vi.fn<(content: unknown, options?: unknown) => string>(
    () => "error-return-id",
  ),
  info: vi.fn<(content: unknown, options?: unknown) => string>(
    () => "info-return-id",
  ),
  loading: vi.fn<(content: unknown, options?: unknown) => string>(
    () => "loading-return-id",
  ),
  message: vi.fn<(content: unknown, options?: unknown) => string>(
    () => "message-return-id",
  ),
  success: vi.fn<(content: unknown, options?: unknown) => string>(
    () => "success-return-id",
  ),
  warning: vi.fn<(content: unknown, options?: unknown) => string>(
    () => "warning-return-id",
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    custom: mocks.custom,
    dismiss: mocks.dismiss,
    error: mocks.error,
    info: mocks.info,
    loading: mocks.loading,
    message: mocks.message,
    success: mocks.success,
    warning: mocks.warning,
  },
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

describe("showToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["SUCCESS", "success"],
    ["INFO", "info"],
    ["LOADING", "loading"],
    ["MESSAGE", "message"],
    ["CUSTOM", "message"],
  ] as const)(
    "routes %s through native Sonner and captures on mount",
    async (type, method) => {
      const options = { duration: 321, id: `${type.toLowerCase()}-toast-id` };
      const result = showToast(
        {
          type,
          title: `PRIVATE-${type}-TITLE`,
          analytics: { operation: "dashboard.create" },
        },
        options,
      );
      const toastMock = mocks[method];

      expect(result).toBe(`${method}-return-id`);
      expect(toastMock).toHaveBeenCalledOnce();
      expect(toastMock.mock.calls[0]?.[1]).toBe(options);
      expect(mocks.capture).not.toHaveBeenCalled();

      render(toastMock.mock.calls[0]?.[0] as ReactNode);

      await waitFor(() => {
        expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
          toastType: type,
          source: "application",
          operation: "dashboard.create",
          hasErrorId: false,
        });
      });
      expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(
        `PRIVATE-${type}-TITLE`,
      );
    },
  );

  it.each([
    ["ERROR", "error"],
    ["WARNING", "warning"],
  ] as const)(
    "allowlists %s metadata and forwards the error ID",
    async (type, method) => {
      const titleSentinel = `PRIVATE-${type}-TITLE`;
      const errorId = `${type.toLowerCase()}-error-id`;
      const result = showToast({
        type,
        title: titleSentinel,
        analytics: {
          operation: "dashboard.create",
          errorOrigin: "backend",
          errorCategory: "internal",
          trpcCode: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          errorId,
        },
      });
      const toastMock = mocks[method];

      expect(result).toBe(`${method}-return-id`);
      expect(mocks.capture).not.toHaveBeenCalled();
      render(toastMock.mock.calls[0]?.[0] as ReactNode);

      await waitFor(() => {
        expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
          toastType: type,
          source: "application",
          operation: "dashboard.create",
          errorOrigin: "backend",
          errorCategory: "internal",
          trpcCode: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          hasErrorId: true,
          errorId,
          isOperationFallback: false,
        });
      });
      expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(
        titleSentinel,
      );
    },
  );

  it("captures a queued toast exactly once across StrictMode and rerenders", async () => {
    showToast({
      type: "SUCCESS",
      title: "PRIVATE-QUEUED-TITLE",
      analytics: { operation: "dashboard.create" },
    });
    const content = mocks.success.mock.calls[0]?.[0] as ReactNode;

    expect(mocks.capture).not.toHaveBeenCalled();
    const view = render(<StrictMode>{content}</StrictMode>);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());

    view.rerender(<StrictMode>{content}</StrictMode>);
    expect(mocks.capture).toHaveBeenCalledOnce();
  });

  it("captures a loading toast's success transition when the same ID is reused", async () => {
    const options = { id: "shared-toast-id" };
    showToast(
      {
        type: "LOADING",
        title: "Preparing",
        analytics: { operation: "dashboard.create" },
      },
      options,
    );
    const view = render(mocks.loading.mock.calls[0]?.[0] as ReactNode);
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());

    showToast(
      {
        type: "SUCCESS",
        title: "Created",
        analytics: { operation: "dashboard.create" },
      },
      options,
    );
    view.rerender(mocks.success.mock.calls[0]?.[0] as ReactNode);

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(mocks.capture.mock.calls.map((call) => call[1].toastType)).toEqual([
      "LOADING",
      "SUCCESS",
    ]);
  });

  it("preserves custom render IDs and options without exporting content", async () => {
    const options = { duration: 777, id: "custom-option-id" };
    const result = showCustomToast(
      (id) => <span>PRIVATE-CUSTOM-CONTENT {id}</span>,
      {
        type: "CUSTOM",
        analytics: { operation: "dashboard.create" },
      },
      options,
    );

    expect(result).toBe("custom-return-id");
    expect(mocks.custom.mock.calls[0]?.[1]).toBe(options);
    expect(mocks.capture).not.toHaveBeenCalled();

    const renderToast = mocks.custom.mock.calls[0]?.[0];
    const view = render(
      <StrictMode>{renderToast?.("sonner-custom-id") as ReactNode}</StrictMode>,
    );
    expect(screen.getByText(/sonner-custom-id/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledOnce());

    view.rerender(
      <StrictMode>{renderToast?.("sonner-custom-id") as ReactNode}</StrictMode>,
    );
    expect(mocks.capture).toHaveBeenCalledOnce();
    expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
      toastType: "CUSTOM",
      source: "application",
      operation: "dashboard.create",
      hasErrorId: false,
    });
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(
      "PRIVATE-CUSTOM-CONTENT",
    );
  });

  it("requires registered operations and complete error classification", () => {
    expectTypeOf<ReturnType<typeof showToast>>().toExtend<string | number>();

    if (false) {
      // @ts-expect-error analytics are mandatory for every native toast
      showToast({ type: "SUCCESS", title: "Saved" });
      showToast({
        type: "SUCCESS",
        title: "Saved",
        // @ts-expect-error success operations must be registered static IDs
        analytics: { operation: "resource.dynamic" },
      });
      // @ts-expect-error errors require both origin and category
      showToast({
        type: "ERROR",
        title: "Failed",
        analytics: { operation: "dashboard.create", errorOrigin: "backend" },
      });
      // @ts-expect-error custom rendering requires metadata too
      showCustomToast(() => "Rendered");
    }
  });

  it("dismisses a toast by ID without recording another shown event", () => {
    dismissToast("toast-to-dismiss");

    expect(mocks.dismiss).toHaveBeenCalledExactlyOnceWith("toast-to-dismiss");
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
