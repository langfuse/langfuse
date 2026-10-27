import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SuccessNotification } from "@/src/features/notifications/SuccessNotification";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

describe("SuccessNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures bounded metadata once without rendered toast content", async () => {
    const view = render(
      <SuccessNotification
        title="Sensitive success title"
        description="Sensitive customer-controlled details"
        operation="dashboard.create"
        onDismiss={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledWith("toast:shown", {
        toastType: "SUCCESS",
        source: "application",
        operation: "dashboard.create",
        hasErrorId: false,
      });
    });

    view.rerender(
      <SuccessNotification
        title="Another title"
        description="Another description"
        operation="dashboard.clone"
        onDismiss={vi.fn()}
      />,
    );

    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain("Sensitive");
    expect(JSON.stringify(mocks.capture.mock.calls)).not.toContain(
      "Another title",
    );
  });

  it("captures a manual dismiss with the same operation", async () => {
    const onDismiss = vi.fn();
    render(
      <SuccessNotification
        title="Saved"
        description="Done"
        operation="dashboard.clone"
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(mocks.capture).toHaveBeenLastCalledWith("toast:dismiss", {
      toastType: "SUCCESS",
      source: "application",
      operation: "dashboard.clone",
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
