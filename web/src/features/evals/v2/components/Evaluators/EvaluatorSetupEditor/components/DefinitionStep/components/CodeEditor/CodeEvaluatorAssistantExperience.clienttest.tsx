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
        {() => <div>Code editor</div>}
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
        {() => <div>Code editor</div>}
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
    expect(
      screen.getByRole("button", {
        name: "Answer cites a retrieved document",
      }),
    ).toBeDisabled();

    resolveSubmission(true);
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByText("Code editor")).not.toBeInTheDocument();
  });

  it("does not remember manual mode after successful AI generation", async () => {
    const firstRender = render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        {() => <div>Code editor</div>}
      </CodeEvaluatorAssistantExperience>,
    );
    fireEvent.change(
      screen.getByLabelText("Describe the code evaluator you want"),
      { target: { value: "Score empty responses" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create with Langfuse Assistant" }),
    );
    await waitFor(() => expect(submitRequest).toHaveBeenCalledOnce());
    firstRender.unmount();

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        {() => <div>Code editor</div>}
      </CodeEvaluatorAssistantExperience>,
    );
    expect(
      screen.getByText("Describe what this evaluator should check."),
    ).toBeInTheDocument();
  });

  it("remembers when the user chooses to code scratch evaluators", () => {
    const { unmount } = render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        {() => <div>Code editor</div>}
      </CodeEvaluatorAssistantExperience>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Write it myself" }));
    expect(screen.getByText("Code editor")).toBeInTheDocument();
    unmount();

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        {(assistantAction) => (
          <>
            <div>Code editor</div>
            {assistantAction}
          </>
        )}
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Write with AI" }),
    ).toBeInTheDocument();
  });

  it("keeps edit mode on the code editor until AI editing is requested", async () => {
    render(
      <CodeEvaluatorAssistantExperience
        context="edit"
        onAssistantSubmit={submitRequest}
      >
        {(assistantAction) => (
          <>
            <div>Code editor</div>
            {assistantAction}
          </>
        )}
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit with AI" }));

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Describe how to change this code evaluator"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Edit with Langfuse Assistant"),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByLabelText("Describe how to change this code evaluator"),
      { key: "Escape" },
    );
    expect(
      screen.queryByLabelText("Describe how to change this code evaluator"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit with AI" }),
      ).toHaveFocus(),
    );
    expect(capture.mock.calls).toEqual([
      [
        "evaluators:code_editor_mode_switch",
        { context: "edit", mode: "assistant" },
      ],
      ["evaluators:code_editor_mode_switch", { context: "edit", mode: "code" }],
    ]);
  });

  it("keeps the floating palette open while submission is pending", async () => {
    let resolveSubmission: (started: boolean) => void = () => undefined;
    submitRequest.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveSubmission = resolve;
      }),
    );
    render(
      <CodeEvaluatorAssistantExperience
        context="edit"
        onAssistantSubmit={submitRequest}
      >
        {(assistantAction) => assistantAction}
      </CodeEvaluatorAssistantExperience>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit with AI" }));
    const input = screen.getByLabelText(
      "Describe how to change this code evaluator",
    );
    fireEvent.change(input, { target: { value: "Handle empty outputs" } });
    fireEvent.submit(input.closest("form")!);

    expect(
      screen.getByRole("button", { name: "Dismiss AI editor" }),
    ).toBeDisabled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toBeInTheDocument();

    resolveSubmission(false);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Dismiss AI editor" }),
      ).toBeEnabled(),
    );
  });

  it("shows the code editor when the Assistant launcher is unavailable", () => {
    launcher.visible = false;

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        onAssistantSubmit={submitRequest}
      >
        {(assistantAction) => (
          <>
            <div>Code editor</div>
            {assistantAction}
          </>
        )}
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Write with AI" }),
    ).not.toBeInTheDocument();
  });
});
