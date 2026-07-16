import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ChatMessage } from "./ChatMessage";
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
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

// 12 lines, well above the 250-char collapse threshold
const longSystemPrompt = Array.from(
  { length: 12 },
  (_, i) =>
    `system-prompt-line-${i + 1} lorem ipsum dolor sit amet consectetur adipiscing elit`,
).join("\n");

function renderChatMessage(
  message: ChatMlMessage,
  { shouldRenderMarkdown = true }: { shouldRenderMarkdown?: boolean } = {},
) {
  return render(
    <MarkdownContextProvider>
      <ChatMessage
        message={message}
        shouldRenderMarkdown={shouldRenderMarkdown}
        currentView="pretty"
      />
    </MarkdownContextProvider>,
  );
}

// getByRole ignores elements hidden via display:none, so queries only see the
// active render path (markdown vs json), even though ChatMessage mounts both.
const expandButton = () =>
  screen.queryByRole("button", { name: /expand system prompt/i });
const collapseButton = () =>
  screen.queryByRole("button", { name: /collapse system prompt/i });

describe("ChatMessage system prompt collapse", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("collapses a long system message on the markdown path", () => {
    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    expect(expandButton()).toBeInTheDocument();
  });

  it("collapses a long system message that carries a name", () => {
    // A `name` makes the display title the name instead of the role; collapse
    // must still key off the raw role.
    renderChatMessage({
      role: "system",
      name: "planner-instructions",
      content: longSystemPrompt,
    } as ChatMlMessage);

    expect(expandButton()).toBeInTheDocument();
  });

  it("collapses a long system message on the json/pretty path (markdown off)", () => {
    renderChatMessage(
      { role: "system", content: longSystemPrompt } as ChatMlMessage,
      { shouldRenderMarkdown: false },
    );

    expect(expandButton()).toBeInTheDocument();
  });

  it("expands on click and persists the expanded preference", () => {
    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    fireEvent.click(expandButton()!);

    expect(collapseButton()).toBeInTheDocument();
    expect(localStorage.getItem("collapseSystemPrompt")).toBe("false");
  });

  it("respects a persisted expanded preference and does not force-collapse", () => {
    localStorage.setItem("collapseSystemPrompt", "false");

    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    // rendered expanded, with the option to collapse still offered
    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).toBeInTheDocument();
  });

  it("migrates the legacy expanded preference key and writes it through", () => {
    // pre-existing "user expanded" choice under the old global key
    localStorage.setItem("traceSystemPrompt:collapsed", "false");

    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).toBeInTheDocument();
    // the choice lands under the new key even without user interaction
    expect(localStorage.getItem("collapseSystemPrompt")).toBe("false");
  });

  it("collapses a long system prompt sent as content parts", () => {
    renderChatMessage({
      role: "system",
      content: [{ type: "text", text: longSystemPrompt }],
    } as unknown as ChatMlMessage);

    expect(expandButton()).toBeInTheDocument();

    fireEvent.click(expandButton()!);

    expect(collapseButton()).toBeInTheDocument();
  });

  it("does not collapse when only media parts push a system prompt over the threshold", () => {
    // short text + a large image part: the serialized media must not count
    // toward the collapse threshold (and must never appear in a preview)
    renderChatMessage({
      role: "system",
      content: [
        { type: "text", text: "Short system prompt." },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${"A".repeat(1000)}` },
        },
      ],
    } as unknown as ChatMlMessage);

    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).not.toBeInTheDocument();
  });

  it("offers no toggle when the preview would hide nothing", () => {
    // above the char threshold, but fits within 4 lines / 500 chars, so
    // collapsing would not hide anything — a toggle would be dead
    const content = Array.from(
      { length: 3 },
      (_, i) => `line-${i + 1} ${"x".repeat(90)}`,
    ).join("\n");

    renderChatMessage({ role: "system", content } as ChatMlMessage);

    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).not.toBeInTheDocument();
  });

  it("keeps the toggle functional in-session when localStorage is blocked", () => {
    const throwingStorage: Storage = {
      get length() {
        return 0;
      },
      clear: () => {
        throw new Error("storage blocked");
      },
      getItem: () => {
        throw new Error("storage blocked");
      },
      key: () => null,
      removeItem: () => {
        throw new Error("storage blocked");
      },
      setItem: () => {
        throw new Error("storage blocked");
      },
    };
    vi.stubGlobal("localStorage", throwingStorage);

    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    // initial state comes from the in-memory session fallback; whichever
    // toggle is offered, clicking it must flip the state
    const startedExpanded = collapseButton() !== null;
    fireEvent.click((startedExpanded ? collapseButton() : expandButton())!);

    if (startedExpanded) {
      expect(expandButton()).toBeInTheDocument();
      expect(collapseButton()).not.toBeInTheDocument();
    } else {
      expect(collapseButton()).toBeInTheDocument();
      expect(expandButton()).not.toBeInTheDocument();
    }
  });

  it("does not collapse long non-system messages", () => {
    renderChatMessage({
      role: "user",
      content: longSystemPrompt,
    } as ChatMlMessage);

    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).not.toBeInTheDocument();
  });

  it("does not collapse short system messages", () => {
    renderChatMessage({
      role: "system",
      content: "You are a helpful assistant.",
    } as ChatMlMessage);

    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).not.toBeInTheDocument();
  });
});
