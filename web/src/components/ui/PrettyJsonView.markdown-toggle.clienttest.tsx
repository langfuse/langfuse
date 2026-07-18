/**
 * PrettyJsonView's markdown mode (bare markdown-like strings outside the
 * ChatML path) auto-rendered markdown with no user override (#14778). These
 * tests pin the header toggle: raw mode renders preformatted text with real
 * line breaks, and non-markdown content never shows the toggle.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
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

// A bare string with markdown structure: heading + numbered lines.
const markdownString = [
  "# Call summary",
  "1. Greeted the customer.",
  "2. Resolved the issue.",
].join("\n");

function renderView(json: unknown) {
  return render(
    <MarkdownContextProvider>
      <PrettyJsonView title="Input" json={json} currentView="pretty" />
    </MarkdownContextProvider>,
  );
}

const rawToggle = () =>
  screen.queryByRole("button", { name: /view as plain text/i });
const markdownToggle = () =>
  screen.queryByRole("button", { name: /render markdown/i });

describe("PrettyJsonView markdown-mode raw/markdown toggle (#14778)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  it("renders markdown by default and offers the plain-text toggle", () => {
    renderView(markdownString);

    expect(
      screen.getByRole("heading", { name: /call summary/i }),
    ).toBeInTheDocument();
    expect(rawToggle()).toBeInTheDocument();
  });

  it("switches to preformatted text with real line breaks and persists the choice", () => {
    const { container } = renderView(markdownString);

    fireEvent.click(rawToggle()!);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("pre")?.textContent).toBe(markdownString);
    expect(localStorage.getItem("shouldRenderMarkdown")).toBe("false");
    expect(markdownToggle()).toBeInTheDocument();
  });

  it("honors a persisted raw preference on mount", () => {
    localStorage.setItem("shouldRenderMarkdown", "false");

    const { container } = renderView(markdownString);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("pre")?.textContent).toBe(markdownString);
  });

  it("offers no toggle for non-markdown JSON content", () => {
    renderView({ foo: "bar", n: 1 });

    expect(rawToggle()).not.toBeInTheDocument();
    expect(markdownToggle()).not.toBeInTheDocument();
  });
});
