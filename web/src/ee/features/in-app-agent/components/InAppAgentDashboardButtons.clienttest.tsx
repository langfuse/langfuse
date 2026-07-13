import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  InAppAgentDashboardComposer,
  InAppAgentWidgetComposer,
} from "./InAppAgentDashboardButtons";

const startAssistantRun = vi.fn().mockResolvedValue(true);
let isRunning = false;

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({
    isAvailable: true,
    isRunning,
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
    isRunning = false;
    startAssistantRun.mockClear();
  });

  it("creates the requested widget once when Enter is pressed", async () => {
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
    fireEvent.keyDown(screen.getByLabelText("Describe the widget you want"), {
      key: "Enter",
      code: "Enter",
    });

    await waitFor(() => {
      expect(startAssistantRun).toHaveBeenCalledWith({
        source: "dashboard_widget",
        dashboardId: "dashboard-1",
        request: "Show p95 latency by model",
      });
    });
    expect(startAssistantRun).toHaveBeenCalledOnce();
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

  it("locks the dashboard creation preferences while the assistant runs", () => {
    isRunning = true;

    render(
      <InAppAgentDashboardComposer
        name="Reliability"
        description="Track production reliability"
      />,
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Design and add widgets for this dashboard",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Continue with Assistant" }),
    ).toBeDisabled();
  });
});
