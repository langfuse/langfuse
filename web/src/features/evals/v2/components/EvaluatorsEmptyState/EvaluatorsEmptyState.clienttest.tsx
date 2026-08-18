import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DETECT_TOPICS_ASSISTANT_PROMPT } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import { EvaluatorsEmptyState } from "./EvaluatorsEmptyState";

const agentContext = vi.hoisted(() => ({
  canUseAssistant: true,
  openAssistant: vi.fn().mockReturnValue(true),
  submit: vi.fn().mockResolvedValue(true),
}));
const capture = vi.hoisted(() => vi.fn());
const { openAssistant, submit } = agentContext;

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => agentContext,
  useCanUseInAppAgent: () => agentContext.canUseAssistant,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));

describe("EvaluatorsEmptyState", () => {
  beforeEach(() => {
    agentContext.canUseAssistant = true;
    openAssistant.mockClear().mockReturnValue(true);
    submit.mockClear().mockResolvedValue(true);
    capture.mockClear();
  });

  it("opens the assistant with the Detect Topics prompt", async () => {
    const onSelectTemplate = vi.fn();
    render(
      <EvaluatorsEmptyState
        onSelectTemplate={onSelectTemplate}
        onBrowseLibrary={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Detect Topics/ }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(DETECT_TOPICS_ASSISTANT_PROMPT, {
        newConversation: true,
        entryPoint: "evaluators-empty-state",
      });
    });
    expect(openAssistant).toHaveBeenCalledWith("evaluators_empty_state");
    expect(onSelectTemplate).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(
      "evaluators:empty_state_detect_topics",
      {
        openedAssistant: true,
      },
    );
  });

  it("falls back to the topic-classifier template when the assistant is unavailable", () => {
    agentContext.canUseAssistant = false;
    const onSelectTemplate = vi.fn();
    render(
      <EvaluatorsEmptyState
        onSelectTemplate={onSelectTemplate}
        onBrowseLibrary={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Detect Topics/ }));

    expect(openAssistant).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(onSelectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "managed",
        key: "topic-classifier",
      }),
    );
    expect(capture).toHaveBeenCalledWith(
      "evaluators:empty_state_detect_topics",
      {
        openedAssistant: false,
      },
    );
    expect(capture).not.toHaveBeenCalledWith(
      "evaluators:empty_state_template_select",
      expect.anything(),
    );
  });

  it("keeps the Detect Topics card on the page when the enable-AI dialog is shown", () => {
    openAssistant.mockReturnValue(false);
    const onSelectTemplate = vi.fn();
    render(
      <EvaluatorsEmptyState
        onSelectTemplate={onSelectTemplate}
        onBrowseLibrary={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Detect Topics/ }));

    expect(openAssistant).toHaveBeenCalledWith("evaluators_empty_state");
    expect(submit).not.toHaveBeenCalled();
    expect(onSelectTemplate).not.toHaveBeenCalled();
  });
});
