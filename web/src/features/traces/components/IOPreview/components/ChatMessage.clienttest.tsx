import { fireEvent, render, screen } from "@testing-library/react";
import { Pencil } from "@langfuse/icons";
import { vi } from "vitest";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));

// ChatMessage mounts both render paths (one is display:none), so the JSON
// path's media tag resolves too — stub its project/URL lookups.
vi.mock("@/src/hooks/useProjectIdFromURL", () => ({ default: () => "p1" }));
vi.mock("@/src/components/ui/media/useResolvedMedia", () => ({
  useResolvedMedia: () => ({
    status: "idle",
    url: undefined,
    refreshIfNeeded: async () => undefined,
  }),
}));

// Stands in for the real media renderer (it needs a session + signed-URL
// query); the contract under test is which reference reaches it.
vi.mock("@/src/components/ui/LangfuseMediaView", () => ({
  LangfuseMediaView: ({
    mediaReferenceString,
  }: {
    mediaReferenceString?: unknown;
  }) => (
    <div
      data-testid="langfuse-media"
      data-media-ref={
        typeof mediaReferenceString === "string"
          ? mediaReferenceString
          : (mediaReferenceString as { referenceString?: string })
              ?.referenceString
      }
    />
  ),
}));

import { ChatMlArraySchema } from "@langfuse/shared";

import { ChatMessage } from "./ChatMessage";
import {
  type ChatMlMessage,
  getMessageTitle,
} from "../../../fns/chatMessageUtils";
import { type IOPreviewContentMode } from "../IOPreview";

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
  {
    shouldRenderMarkdown = true,
    contentMode = "all",
    defaultCollapsed,
  }: {
    shouldRenderMarkdown?: boolean;
    contentMode?: IOPreviewContentMode;
    defaultCollapsed?: boolean;
  } = {},
) {
  return render(
    <ChatMessage
      message={message}
      title={getMessageTitle(message)}
      shouldRenderMarkdown={shouldRenderMarkdown}
      currentView="pretty"
      contentMode={contentMode}
      defaultCollapsed={defaultCollapsed}
    />,
  );
}

describe("ChatMessage content modes", () => {
  const assistantWithToolCall = {
    role: "assistant",
    content: "I will check that for you.",
    tool_calls: [
      {
        id: "call-1",
        name: "search_traces",
        arguments: '{"limit":10}',
      },
    ],
  } as unknown as ChatMlMessage;

  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("keeps assistant content but removes tool details in conversation mode", () => {
    renderChatMessage(assistantWithToolCall, { contentMode: "conversation" });

    expect(
      screen.getAllByText("I will check that for you.").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("search_traces")).not.toBeInTheDocument();
  });
});

// getByRole ignores elements hidden via display:none, so queries only see the
// active render path (markdown vs json), even though ChatMessage mounts both.
// The section caret is labelled by the section title (the message role).
const expandButtons = () =>
  screen.queryAllByRole("button", { name: /^expand system/i });
const collapseButtons = () =>
  screen.queryAllByRole("button", { name: /^collapse system/i });
const expandButton = () => expandButtons()[0] ?? null;
const collapseButton = () => collapseButtons()[0] ?? null;

describe("ChatMessage section caret", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("hides and restores the message body", () => {
    renderChatMessage({
      role: "user",
      content: "Where is my refund?",
    } as ChatMlMessage);
    // The hidden JSON path keeps its own copy of the text, so check visibility.
    const bodies = () => screen.queryAllByText("Where is my refund?");

    expect(bodies()[0]).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Collapse user" }));

    bodies().forEach((body) => expect(body).not.toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "Expand user" }));

    expect(bodies()[0]).toBeVisible();
  });

  it("toggles from the header row, not from its controls", () => {
    renderChatMessage({
      role: "user",
      content: "Where is my refund?",
    } as ChatMlMessage);
    const bodies = () => screen.queryAllByText("Where is my refund?");

    // Clicking the title text (inside the row button) collapses.
    fireEvent.click(screen.getAllByText("user")[0]);
    bodies().forEach((body) => expect(body).not.toBeVisible());

    fireEvent.click(screen.getAllByText("user")[0]);
    expect(bodies()[0]).toBeVisible();

    // The copy control sits beside the row button and does not toggle.
    fireEvent.click(screen.getAllByTitle("Copy to clipboard")[0]);
    expect(bodies()[0]).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Collapse user" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the open state when switching to the passthrough JSON view", () => {
    renderChatMessage(
      {
        role: "user",
        content: "Where is my refund?",
        json: { role: "user", content: "Where is my refund?", channel: "web" },
      } as unknown as ChatMlMessage,
      { defaultCollapsed: true },
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand user" }));
    fireEvent.click(screen.getAllByTitle("Show passthrough JSON data")[0]);

    expect(
      screen.queryByRole("button", { name: "Expand user" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse user" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("channel")[0]).toBeInTheDocument();
  });

  it("gives a role-less message a header and keeps its tool calls and thinking", () => {
    render(
      <ChatMessage
        message={
          {
            content: "Checking that for you.",
            thinking: [{ content: "Need the trace first." }],
            tool_calls: [
              { id: "call-1", name: "search_traces", arguments: "{}" },
            ],
          } as unknown as ChatMlMessage
        }
        title=""
        shouldRenderMarkdown
        currentView="pretty"
        actions={[{ icon: Pencil, label: "Correct output", onClick: () => {} }]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Collapse Input" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/search_traces/)[0]).toBeInTheDocument();
    expect(screen.getAllByText("Need the trace first.")[0]).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Correct output" }),
    ).toBeInTheDocument();
  });

  it("mounts only the header while collapsed", () => {
    renderChatMessage(
      { role: "user", content: "Where is my refund?" } as ChatMlMessage,
      { defaultCollapsed: true },
    );

    expect(screen.queryAllByText("Where is my refund?")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Expand user" }));

    expect(screen.getAllByText("Where is my refund?")[0]).toBeVisible();
  });

  it("starts collapsed when asked, keeping the header", () => {
    renderChatMessage(
      { role: "user", content: "Where is my refund?" } as ChatMlMessage,
      { defaultCollapsed: true },
    );

    expect(screen.queryByText("Where is my refund?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand user" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

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

    // One caret in the section header; the body is not rendered.
    expect(expandButtons()).toHaveLength(1);
    expect(expandButton()!.closest(".io-message-header")).not.toBeNull();
    expect(screen.queryByText(/system-prompt-line-1 /)).not.toBeInTheDocument();
  });

  it("collapses a long system message that carries a name", () => {
    // A `name` makes the display title the name instead of the role; collapse
    // must still key off the raw role.
    renderChatMessage({
      role: "system",
      name: "planner-instructions",
      content: longSystemPrompt,
    } as ChatMlMessage);

    expect(
      screen.getByRole("button", { name: /^expand planner-instructions/i }),
    ).toBeInTheDocument();
  });

  it("collapses a long system message on the json/pretty path (markdown off)", () => {
    renderChatMessage(
      { role: "system", content: longSystemPrompt } as ChatMlMessage,
      { shouldRenderMarkdown: false },
    );

    // The caret in the section header is the one collapse control here too.
    expect(expandButtons()).toHaveLength(1);
    expect(expandButtons()[0].closest(".io-message-header")).not.toBeNull();
  });

  it("expands on click and persists the expanded preference", () => {
    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    fireEvent.click(expandButton()!);

    expect(collapseButton()).toBeInTheDocument();
    expect(screen.getAllByText(/system-prompt-line-1 /).length).toBeGreaterThan(
      0,
    );
    expect(localStorage.getItem("collapseSystemPrompt")).toBe("false");
  });

  it("respects a persisted expanded preference and collapses back on click", () => {
    localStorage.setItem("collapseSystemPrompt", "false");

    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    // rendered expanded, with the caret offering to collapse
    expect(expandButtons()).toHaveLength(0);
    expect(collapseButtons()).toHaveLength(1);

    fireEvent.click(collapseButton()!);

    expect(expandButtons().length).toBeGreaterThan(0);
    expect(localStorage.getItem("collapseSystemPrompt")).toBe("true");
  });

  it("collapses a long system prompt from the header on the json/pretty path", () => {
    localStorage.setItem("collapseSystemPrompt", "false");

    renderChatMessage(
      { role: "system", content: longSystemPrompt } as ChatMlMessage,
      { shouldRenderMarkdown: false },
    );

    expect(collapseButtons()).toHaveLength(1);

    fireEvent.click(collapseButton()!);

    expect(expandButtons()).toHaveLength(1);
    expect(localStorage.getItem("collapseSystemPrompt")).toBe("true");
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

  it("starts open when only media parts push a system prompt over the threshold", () => {
    // short text + a large image part: the serialized media must not count
    // toward the long-prompt threshold
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
    expect(collapseButton()).toBeInTheDocument();
  });

  it("starts open when the prompt is short enough to read at a glance", () => {
    // above the char threshold, but fits within 4 lines / 500 chars
    const content = Array.from(
      { length: 3 },
      (_, i) => `line-${i + 1} ${"x".repeat(90)}`,
    ).join("\n");

    renderChatMessage({ role: "system", content } as ChatMlMessage);

    expect(expandButton()).not.toBeInTheDocument();
    expect(collapseButton()).toBeInTheDocument();
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
    expect(collapseButton()).toBeInTheDocument();
  });
});

describe("ChatMessage copy", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
    copyTextToClipboard.mockClear();
  });

  it("decodes \\uXXXX escapes when copying a tool-call-only message", () => {
    // Escaped Japanese as ingested via the Python SDK's ensure_ascii=True.
    renderChatMessage({
      role: "assistant",
      tool_calls: [
        {
          id: "call-1",
          name: "search_traces",
          arguments: '{"question":"\\u3053\\u3093\\u306b\\u3061\\u306f"}',
        },
      ],
    } as unknown as ChatMlMessage);

    fireEvent.click(screen.getAllByTitle("Copy to clipboard")[0]);

    expect(copyTextToClipboard).toHaveBeenCalledTimes(1);
    const copied = copyTextToClipboard.mock.calls[0][0] as string;
    expect(copied).toContain("こんにちは");
    expect(copied).not.toContain("\\u3053");
  });
});

describe("ChatMessage media content parts", () => {
  const mediaId = "abc123def456ghi789jkl0";
  const referenceString = `@@@langfuseMedia:type=image/png|id=${mediaId}|source=base64_data_uri@@@`;

  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  // LFE-14815 / LFE-13602: OpenAIContentSchema's url union parses the media
  // reference into an object, so a renderer re-validating the untransformed
  // schema drops the part silently.
  it("renders an image_url part carrying a langfuse media reference", () => {
    renderChatMessage({
      role: "user",
      content: [
        { type: "text", text: "here is the thermostat" },
        { type: "image_url", image_url: { url: referenceString } },
      ],
    } as unknown as ChatMlMessage);

    expect(screen.getByText("here is the thermostat")).toBeInTheDocument();
    expect(screen.getByTestId("langfuse-media")).toHaveAttribute(
      "data-media-ref",
      referenceString,
    );
  });

  it("renders an AI SDK file part carrying a langfuse media reference", () => {
    renderChatMessage({
      role: "user",
      content: [
        { type: "text", text: "attached report" },
        {
          type: "file",
          data: referenceString,
          mediaType: "image/png",
        },
      ],
    } as unknown as ChatMlMessage);

    expect(screen.getByText("attached report")).toBeInTheDocument();
    expect(screen.getByTestId("langfuse-media")).toHaveAttribute(
      "data-media-ref",
      referenceString,
    );
  });

  // LFE-9577: a single reference string renders inline, and so do several in
  // one string — but an ARRAY of bare references failed OpenAIContentParts
  // (which only accepted `{type, …}` objects) and dropped to a JSON table.
  it("renders an array of bare media reference strings inline", () => {
    const second = referenceString.replace(mediaId, "zzz987yxw654vut321srq0");
    renderChatMessage({
      role: "user",
      content: [referenceString, second],
    } as unknown as ChatMlMessage);

    expect(
      screen
        .getAllByTestId("langfuse-media")
        .map((el) => el.getAttribute("data-media-ref")),
    ).toEqual([referenceString, second]);
  });

  // The ChatML transform materializes all 10 schema keys, so a message that
  // normalized to `{}` used to table out one `undefined` row per key.
  it("renders nothing for a parsed message that carries no data", () => {
    const parsed = ChatMlArraySchema.parse([{}]);
    const { container } = renderChatMessage(parsed[0] as ChatMlMessage);

    expect(container).toBeEmptyDOMElement();
  });

  // Same materialized keys, but this shape has one real field so it still
  // renders through the whole-message fallback table.
  it("omits unset ChatML keys from the fallback table", () => {
    const parsed = ChatMlArraySchema.parse([
      { role: "user", name: "Agent", content: "" },
    ]);
    renderChatMessage(parsed[0] as ChatMlMessage);

    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    expect(screen.queryByText("tool_call_id")).not.toBeInTheDocument();
  });

  // A collapsed section hides its attachments with the text; expanding the
  // long system prompt brings them back inline.
  it("shows media parts once a long system prompt is expanded", () => {
    renderChatMessage({
      role: "system",
      content: [
        { type: "text", text: longSystemPrompt },
        { type: "image_url", image_url: { url: referenceString } },
      ],
    } as unknown as ChatMlMessage);

    expect(screen.queryByTestId("langfuse-media")).not.toBeInTheDocument();

    fireEvent.click(expandButton()!);

    expect(screen.getByTestId("langfuse-media")).toHaveAttribute(
      "data-media-ref",
      referenceString,
    );
  });
});
