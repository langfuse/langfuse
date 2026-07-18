/**
 * Trace/observation IO cards auto-render string message content as markdown.
 * CommonMark mangles line-oriented content (numbered rule lists become <ol>,
 * pseudo-XML wrappers like <injected-rules> are swallowed as HTML blocks), and
 * users had no override (#14778). These tests pin the restored Raw/Markdown
 * toggle: it renders raw content as preformatted text with real line breaks
 * and persists the choice via the global markdown preference.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { MarkdownJsonView } from "./MarkdownJsonView";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

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

// Line-oriented content that markdown rendering visibly restructures: the
// numbered lines collapse into a single <ol> instead of staying as lines.
const lineOrientedContent = [
  "Injected rules:",
  "1. Always do X.",
  "2. Never do Y.",
].join("\n");

function renderView(content: unknown) {
  return render(
    <MarkdownContextProvider>
      <MarkdownJsonView title="user" content={content} />
    </MarkdownContextProvider>,
  );
}

const rawToggle = () =>
  screen.queryByRole("button", { name: /view as plain text/i });
const markdownToggle = () =>
  screen.queryByRole("button", { name: /render markdown/i });

describe("MarkdownJsonView raw/markdown toggle (#14778)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("renders markdown by default and offers the plain-text toggle", () => {
    renderView(lineOrientedContent);

    // numbered lines were restructured into a list by the markdown renderer
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(rawToggle()).toBeInTheDocument();
    expect(markdownToggle()).not.toBeInTheDocument();
  });

  it("switches to preformatted text with real line breaks and persists the choice", () => {
    const { container } = renderView(lineOrientedContent);

    fireEvent.click(rawToggle()!);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toBe(lineOrientedContent);
    expect(localStorage.getItem("shouldRenderMarkdown")).toBe("false");
    expect(markdownToggle()).toBeInTheDocument();
  });

  it("honors a persisted raw preference on mount and can switch back", () => {
    localStorage.setItem("shouldRenderMarkdown", "false");

    const { container } = renderView(lineOrientedContent);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(container.querySelector("pre")?.textContent).toBe(
      lineOrientedContent,
    );

    fireEvent.click(markdownToggle()!);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(localStorage.getItem("shouldRenderMarkdown")).toBe("true");
  });

  it("preserves line breaks for content sent as OpenAI text content parts", () => {
    localStorage.setItem("shouldRenderMarkdown", "false");

    const { container } = renderView([
      { type: "text", text: lineOrientedContent },
    ]);

    expect(container.querySelector("pre")?.textContent).toBe(
      lineOrientedContent,
    );
  });

  it("offers no toggle for non-markdown-capable content", () => {
    renderView({ nested: { foo: "bar" } });

    expect(rawToggle()).not.toBeInTheDocument();
    expect(markdownToggle()).not.toBeInTheDocument();
  });
});
