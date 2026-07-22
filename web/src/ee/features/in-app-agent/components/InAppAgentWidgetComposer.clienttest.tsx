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
    openAssistant.mockClear().mockReturnValue(true);
    submit.mockClear().mockResolvedValue(true);
  });

  it("starts a fresh Assistant conversation with the widget request", async () => {
    const onSubmitted = vi.fn();
    render(<InAppAgentWidgetComposer onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByLabelText("Describe the widget you want"), {
      target: { value: "  Show p95 latency by model  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add with Langfuse Assistant" }),
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

  it("disables submit for whitespace-only input", () => {
    render(<InAppAgentWidgetComposer onSubmitted={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Describe the widget you want"), {
      target: { value: "   " },
    });

    expect(
      screen.getByRole("button", { name: "Add with Langfuse Assistant" }),
    ).toBeDisabled();
  });

  it("keeps the picker open and preserves the request when submit does not start", async () => {
    submit.mockResolvedValue(false);
    const onSubmitted = vi.fn();
    render(<InAppAgentWidgetComposer onSubmitted={onSubmitted} />);

    const input = screen.getByLabelText("Describe the widget you want");
    fireEvent.change(input, { target: { value: "Show error rate" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Add with Langfuse Assistant" }),
    );

    await waitFor(() => {
      expect(submit).toHaveBeenCalledOnce();
    });
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(input).toHaveValue("Show error rate");
  });
});
