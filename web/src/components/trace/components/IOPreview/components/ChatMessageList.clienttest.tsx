import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ChatMessageList } from "./ChatMessageList";
import { type ChatMlMessage } from "./chat-message-utils";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, value),
  };
}

describe("ChatMessageList session search", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("shows every message without a stale history toggle while searching", () => {
    const messages = Array.from(
      { length: 5 },
      (_, index) =>
        ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `message ${index + 1}`,
        }) as ChatMlMessage,
    );

    render(
      <MarkdownContextProvider>
        <ChatMessageList
          messages={messages}
          shouldRenderMarkdown
          currentView="pretty"
          messageToToolCallNumbers={new Map()}
          searchQuery="message"
        />
      </MarkdownContextProvider>,
    );

    expect(screen.getAllByText("message 2").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /show .* more|hide history/i }),
    ).not.toBeInTheDocument();
  });
});
