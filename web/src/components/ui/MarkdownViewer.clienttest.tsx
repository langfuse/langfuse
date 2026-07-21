import { render } from "@testing-library/react";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const renderMarkdown = (markdown: string) =>
  render(
    <MarkdownContextProvider>
      <MarkdownView markdown={markdown} />
    </MarkdownContextProvider>,
  );

describe("MarkdownView link rendering", () => {
  it("renders an external link as a native anchor opening in a new tab", () => {
    const { container } = renderMarkdown("[example](https://example.com/page)");

    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe("https://example.com/page");
    expect(anchor?.getAttribute("target")).toBe("_blank");
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  // Regression guard for the Sentry "Invalid href '…' passed to next/router"
  // noise family (LANGFUSE-5DZ / 5EA / 5ER, ~40k lifetime events): user-content
  // markdown embeds URLs that a Next.js <Link> rejects (repeated `//` from an
  // embedded second `https://`, etc.). A native <a> never runs the router's
  // href validation, so such a link must render without throwing — a
  // regression to <Link> would throw here.
  it("renders a malformed user URL as an anchor without throwing", () => {
    const malformed =
      "https://www.example.com/a%22,%22thumb%22:%22https://assets.example.com/b";

    expect(() => renderMarkdown(`[bad](${malformed})`)).not.toThrow();

    const { container } = renderMarkdown(`[bad](${malformed})`);
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("target")).toBe("_blank");
  });

  it("renders an unsafe-protocol link as plain text, not an anchor", () => {
    const { container } = renderMarkdown("[x](javascript:alert(1))");

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("x");
  });
});
