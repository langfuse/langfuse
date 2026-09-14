import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

const { copyTextToClipboard } = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("@/src/utils/clipboard", () => ({ copyTextToClipboard }));

// ChatMessage mounts both render paths (one is display:none), so the JSON
// path's media tag resolves too — stub its project/URL lookups.
vi.mock("@/src/hooks/useProjectIdFromURL", () => ({ default: () => "p1" }));
vi.mock("@/src/components/ui/media/useResolvedMedia", () => ({
  useResolvedMedia: () => ({ status: "idle", url: undefined }),
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
import { type ChatMlMessage } from "../../../fns/chatMessageUtils";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
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
  }: {
    shouldRenderMarkdown?: boolean;
    contentMode?: IOPreviewContentMode;
  } = {},
) {
  return render(
    <MarkdownContextProvider>
      <ChatMessage
        message={message}
        shouldRenderMarkdown={shouldRenderMarkdown}
        currentView="pretty"
        contentMode={contentMode}
      />
    </MarkdownContextProvider>,
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
// Header + inline controls share the same accessible name, so look them up
// as a set rather than assuming a single toggle.
const expandButtons = () =>
  screen.queryAllByRole("button", { name: /expand system prompt/i });
const collapseButtons = () =>
  screen.queryAllByRole("button", { name: /collapse system prompt/i });
const expandButton = () => expandButtons()[0] ?? null;
const collapseButton = () => collapseButtons()[0] ?? null;

const systemMessageHeader = () => {
  const headers = screen
    .getAllByText("system")
    .map((node) => node.closest(".io-message-header"))
    .filter((node): node is HTMLElement => node instanceof HTMLElement);
  expect(headers.length).toBeGreaterThan(0);
  return headers[0];
};

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

    expect(expandButtons().length).toBeGreaterThan(0);
    expect(
      within(systemMessageHeader()).getAllByRole("button", {
        name: /expand system prompt/i,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      within(systemMessageHeader()).getByRole("button", {
        name: /system, expand system prompt/i,
      }),
    ).toBeInTheDocument();
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
    expect(expandButtons()).toHaveLength(0);
    expect(collapseButtons().length).toBeGreaterThan(0);
  });

  it("puts a collapse control on the system message header so it is reachable without scrolling", () => {
    // The inline "Collapse system prompt" control lives after the prompt body,
    // so an expanded long prompt hid it below the fold. The header must offer
    // the same action.
    localStorage.setItem("collapseSystemPrompt", "false");

    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    expect(
      within(systemMessageHeader()).getAllByRole("button", {
        name: /collapse system prompt/i,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("collapses from the system message header", () => {
    localStorage.setItem("collapseSystemPrompt", "false");

    renderChatMessage({
      role: "system",
      content: longSystemPrompt,
    } as ChatMlMessage);

    fireEvent.click(
      within(systemMessageHeader()).getAllByRole("button", {
        name: /collapse system prompt/i,
      })[0],
    );

    expect(expandButtons().length).toBeGreaterThan(0);
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

  // The media strip dedupes against what rendered inline, so a collapsed
  // system prompt must not swallow its attachments.
  it("keeps media parts visible while a long system prompt is collapsed", () => {
    renderChatMessage({
      role: "system",
      content: [
        { type: "text", text: longSystemPrompt },
        { type: "image_url", image_url: { url: referenceString } },
      ],
    } as unknown as ChatMlMessage);

    expect(expandButton()).toBeInTheDocument();
    expect(screen.getByTestId("langfuse-media")).toHaveAttribute(
      "data-media-ref",
      referenceString,
    );
  });
});
