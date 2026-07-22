import { render, screen } from "@testing-library/react";

import { ControlledInAppAgentWindow } from "./ControlledInAppAgentWindow";
import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";

const mocks = vi.hoisted(() => ({
  agent: {} as Record<string, unknown>,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/project/project-1/traces" }),
}));

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => mocks.agent,
}));

vi.mock("./InAppAgentWindow", () => ({
  InAppAgentWindow: ({
    messages,
  }: {
    messages: Array<{ content: { type: string; text?: string } }>;
  }) => <span data-testid="content">{messages.at(-1)?.content.text}</span>,
}));

const assistantMessage = (id: string, content: string) =>
  ({ id, role: "assistant", content }) satisfies AgUiMessage;

function setConversation(
  selectedConversationId: string,
  liveMessageVersion: number,
  messages: AgUiMessage[],
) {
  mocks.agent = {
    conversations: [],
    error: null,
    isRunning: true,
    liveMessageVersion,
    messages,
    pendingToolApprovals: [],
    queuedMessages: [],
    selectedConversationId,
  };
}

describe("ControlledInAppAgentWindow", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows accumulated streaming progress immediately after switching back", () => {
    setConversation("conversation-a", 1, [
      assistantMessage("assistant-a", "Conversation A started streaming."),
    ]);
    const { rerender } = render(
      <ControlledInAppAgentWindow
        isExpanded={false}
        onDeleteConversation={vi.fn()}
        onExpandedChange={vi.fn()}
        showCloseButton={false}
      />,
    );

    setConversation("conversation-b", 1, [
      assistantMessage("assistant-b", "Conversation B is also streaming."),
    ]);
    rerender(
      <ControlledInAppAgentWindow
        isExpanded={false}
        onDeleteConversation={vi.fn()}
        onExpandedChange={vi.fn()}
        showCloseButton={false}
      />,
    );

    const accumulatedContent =
      "Conversation A started streaming and made substantial progress while unselected.";
    setConversation("conversation-a", 7, [
      assistantMessage("assistant-a", accumulatedContent),
    ]);
    rerender(
      <ControlledInAppAgentWindow
        isExpanded={false}
        onDeleteConversation={vi.fn()}
        onExpandedChange={vi.fn()}
        showCloseButton={false}
      />,
    );

    expect(screen.getByTestId("content")).toHaveTextContent(accumulatedContent);
  });
});
