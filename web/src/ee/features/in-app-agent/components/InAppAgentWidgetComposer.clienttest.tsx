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
        expect.stringContaining("Show p95 latency by model"),
        { newConversation: true },
      );
    });
    expect(openAssistant).toHaveBeenCalledWith("dashboard_widget");
    expect(onSubmitted).toHaveBeenCalledOnce();
  });
});
