import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CodeEvaluatorAssistantExperience } from "./CodeEvaluatorAssistantExperience";

const submitRequest = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const capture = vi.hoisted(() => vi.fn());
const launcher = vi.hoisted(() => ({ visible: true }));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useIsInAppAgentLauncherVisible: () => launcher.visible,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

describe("CodeEvaluatorAssistantExperience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    launcher.visible = true;
    submitRequest.mockClear().mockResolvedValue(true);
    capture.mockClear();
  });

  it("starts scratch evaluators with an Assistant request and submits it", async () => {
    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.queryByText("Code editor")).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Describe the code evaluator you want"),
      {
        target: { value: "  Score whether the answer cites a source  " },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create with Langfuse Assistant" }),
    );

    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalledWith(
        "Score whether the answer cites a source",
      );
    });
  });

  it("starts only one conversation while a submission is pending", async () => {
    let resolveSubmission: (started: boolean) => void = () => undefined;
    submitRequest.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveSubmission = resolve;
      }),
    );
    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    const input = screen.getByLabelText("Describe the code evaluator you want");
    fireEvent.change(input, {
      target: { value: "Score empty responses" },
    });
    const form = input.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(submitRequest).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Create with Langfuse Assistant" }),
    ).toBeDisabled();

    resolveSubmission(true);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("remembers when the user chooses to code scratch evaluators", () => {
    const { unmount } = render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Code" }));
    expect(screen.getByText("Code editor")).toBeInTheDocument();
    unmount();

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "AI input" }),
    ).toBeInTheDocument();
  });

  it("keeps edit mode on the code editor until AI editing is requested", () => {
    render(
      <CodeEvaluatorAssistantExperience
        context="edit"
        onAssistantSubmit={submitRequest}
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI input" }));

    expect(screen.queryByText("Code editor")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Describe how to change this code evaluator"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Edit with Langfuse Assistant"),
    ).not.toBeInTheDocument();
  });

  it("shows the code editor when the Assistant launcher is unavailable", () => {
    launcher.visible = false;

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "AI input" }),
    ).not.toBeInTheDocument();
  });
});
