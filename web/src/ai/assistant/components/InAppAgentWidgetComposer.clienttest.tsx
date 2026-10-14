import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InAppAgentWidgetComposer } from "./InAppAgentWidgetComposer";

const agentContext = vi.hoisted(() => ({
  openAssistant: vi.fn().mockReturnValue(true),
  submit: vi.fn().mockResolvedValue(true),
}));
const { openAssistant, submit } = agentContext;

describe("InAppAgentWidgetComposer", () => {
  beforeEach(() => {
    openAssistant.mockClear().mockReturnValue(true);
    submit.mockClear().mockResolvedValue(true);
  });

  it("starts a fresh Assistant conversation with the widget request", async () => {
    const onSubmitted = vi.fn();
    render(
      <InAppAgentWidgetComposer
        onSubmitted={onSubmitted}
        openAssistant={openAssistant}
        submit={submit}
      />,
    );

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
    render(
      <InAppAgentWidgetComposer
        onSubmitted={vi.fn()}
        openAssistant={openAssistant}
        submit={submit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Describe the widget you want"), {
      target: { value: "   " },
    });

    expect(
      screen.getByRole("button", { name: "Add with Langfuse Assistant" }),
    ).toBeDisabled();
  });

  it("starts a new widget conversation while the selected conversation is busy", async () => {
    const onSubmitted = vi.fn();
    render(
      <InAppAgentWidgetComposer
        onSubmitted={onSubmitted}
        openAssistant={openAssistant}
        submit={submit}
      />,
    );

    fireEvent.change(screen.getByLabelText("Describe the widget you want"), {
      target: { value: "Show p95 latency" },
    });
    const submitButton = screen.getByRole("button", {
      name: "Add with Langfuse Assistant",
    });

    expect(submitButton).toBeEnabled();
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(submit).toHaveBeenCalledOnce();
    });
    expect(onSubmitted).toHaveBeenCalledOnce();
  });

  it("keeps the picker open and preserves the request when submit does not start", async () => {
    submit.mockResolvedValue(false);
    const onSubmitted = vi.fn();
    render(
      <InAppAgentWidgetComposer
        onSubmitted={onSubmitted}
        openAssistant={openAssistant}
        submit={submit}
      />,
    );

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
