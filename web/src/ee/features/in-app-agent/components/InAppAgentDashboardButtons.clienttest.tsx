import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  InAppAgentDashboardComposer,
  InAppAgentWidgetComposer,
} from "./InAppAgentDashboardButtons";

const startAssistantRun = vi.fn().mockResolvedValue(true);

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({
    isAvailable: true,
    isRunning: false,
    isSubmitting: false,
    startAssistantRun,
  }),
}));

describe("in-app agent dashboard entry points", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  beforeEach(() => {
    startAssistantRun.mockClear();
  });

  it("creates the requested widget from the add-widget dialog", async () => {
    const onSubmitted = vi.fn();
    render(
      <InAppAgentWidgetComposer
        dashboardId="dashboard-1"
        onSubmitted={onSubmitted}
      />,
    );

    fireEvent.change(screen.getByLabelText("Describe the widget you want"), {
      target: { value: "Show p95 latency by model" },
    });
    const form = screen
      .getByRole("button", { name: "Create with Assistant" })
      .closest("form");
    if (!form) {
      throw new Error("Expected widget composer form");
    }
    fireEvent.submit(form);

    await waitFor(() => {
      expect(startAssistantRun).toHaveBeenCalledWith({
        source: "dashboard_widget",
        dashboardId: "dashboard-1",
        request: "Show p95 latency by model",
      });
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it("uses the dashboard purpose and selected widget preference", async () => {
    render(
      <InAppAgentDashboardComposer
        name="Reliability"
        description="Track latency and errors for production"
      />,
    );

    const includeWidgets = screen.getByRole("checkbox", {
      name: "Design and add widgets for this dashboard",
    });
    expect(includeWidgets).toBeChecked();
    fireEvent.click(includeWidgets);

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Assistant" }),
    );

    await waitFor(() => {
      expect(startAssistantRun).toHaveBeenCalledWith({
        source: "dashboard_create",
        name: "Reliability",
        description: "Track latency and errors for production",
        includeWidgets: false,
      });
    });
  });
});
