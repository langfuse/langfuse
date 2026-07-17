import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InAppAgentWidgetComposer } from "./InAppAgentWidgetComposer";

const openAssistant = vi.fn().mockReturnValue(true);
const submit = vi.fn().mockResolvedValue(true);

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({
    isAvailable: true,
    isRunning: false,
    isSubmitting: false,
    openAssistant,
    submit,
  }),
}));

describe("InAppAgentWidgetComposer", () => {
  beforeEach(() => {
    openAssistant.mockClear();
    submit.mockClear();
  });

  it("starts a fresh Assistant conversation with the widget request", async () => {
    const onSubmitted = vi.fn();
    render(<InAppAgentWidgetComposer onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByLabelText("Describe the widget you want"), {
      target: { value: "  Show p95 latency by model  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create with Assistant" }),
    );

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        "Create a dashboard widget for this request and add it to the current dashboard:\n\nShow p95 latency by model\n\nChoose an appropriate data view, metrics, dimensions, filters, and chart type. Briefly explain the plan, then create the widget.",
        { newConversation: true, entryPoint: "add-widget-modal" },
      );
    });
    expect(openAssistant).toHaveBeenCalledWith("dashboard_widget");
    expect(onSubmitted).toHaveBeenCalledOnce();
  });
});
