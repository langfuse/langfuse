import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CodeEvaluatorAssistantExperience } from "./CodeEvaluatorAssistantExperience";

const agentContext = vi.hoisted(() => ({
  isSubmitting: false,
  openAssistant: vi.fn().mockReturnValue(true),
  submit: vi.fn().mockResolvedValue(true),
}));
const capture = vi.hoisted(() => vi.fn());
const launcher = vi.hoisted(() => ({ visible: true }));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => agentContext,
  useIsInAppAgentLauncherVisible: () => launcher.visible,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

describe("CodeEvaluatorAssistantExperience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    launcher.visible = true;
    agentContext.openAssistant.mockClear().mockReturnValue(true);
    agentContext.submit.mockClear().mockResolvedValue(true);
    capture.mockClear();
  });

  it("starts scratch evaluators with an Assistant request and submits it", async () => {
    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        sourceCodeLanguage="TYPESCRIPT"
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
      expect(agentContext.submit).toHaveBeenCalledWith(
        expect.stringContaining("Score whether the answer cites a source"),
        {
          newConversation: true,
          entryPoint: "code-evaluator-editor",
        },
      );
    });
    expect(agentContext.submit.mock.calls[0]?.[0]).toContain("TypeScript");
    expect(agentContext.openAssistant).toHaveBeenCalledWith(
      "code_evaluator_editor",
    );
  });

  it("remembers when the user chooses to code scratch evaluators", () => {
    const { unmount } = render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        sourceCodeLanguage="TYPESCRIPT"
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Code manually" }));
    expect(screen.getByText("Code editor")).toBeInTheDocument();
    unmount();

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        sourceCodeLanguage="TYPESCRIPT"
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start with AI" }),
    ).toBeInTheDocument();
  });

  it("keeps edit mode on the code editor until AI editing is requested", () => {
    render(
      <CodeEvaluatorAssistantExperience
        context="edit"
        sourceCodeLanguage="PYTHON"
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit with AI" }));

    expect(screen.queryByText("Code editor")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Describe how to change this code evaluator"),
    ).toBeInTheDocument();
  });

  it("shows the code editor when the Assistant launcher is unavailable", () => {
    launcher.visible = false;

    render(
      <CodeEvaluatorAssistantExperience
        context="scratch"
        sourceCodeLanguage="TYPESCRIPT"
      >
        <div>Code editor</div>
      </CodeEvaluatorAssistantExperience>,
    );

    expect(screen.getByText("Code editor")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start with AI" }),
    ).not.toBeInTheDocument();
  });
});
