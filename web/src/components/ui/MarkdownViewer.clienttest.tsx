import { render } from "@testing-library/react";
import {
  MarkdownView,
  prependBasePathToInternalHref,
} from "@/src/components/ui/MarkdownViewer";
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

const NESTED_BULLET_MARKDOWN = `Langfuse is an open-source observability and analytics tool for LLM applications.

In practical terms, it helps you:

- **Track and debug LLM calls**
  - Log prompts, model responses, latency, errors, and metadata
- **Evaluate quality**
  - Run evaluations on outputs (automatic metrics or human feedback)
- **Monitor in production**
  - Dashboards for usage, cost, latency, and failure rates`;

const NESTED_ORDERED_MARKDOWN = `Steps:

1. **Prepare the dataset**
   1. Collect traces
   2. Label outcomes
2. **Run the eval**
   1. Score outputs`;

const directChildren = (parent: Element, tagName: string) =>
  Array.from(parent.children).filter(
    (child) => child.tagName === tagName.toUpperCase(),
  );

describe("MarkdownView ordered lists", () => {
  it("preserves an explicit ordered-list start number", () => {
    const { container } = renderMarkdown("2.");

    expect(container.querySelector("ol")?.getAttribute("start")).toBe("2");
  });
});

describe("MarkdownView list item layout", () => {
  // A list item that also contains a nested list has a block sibling
  // after the label. Markers use list-outside and matching left padding
  // so they sit in the gutter beside the first line.
  it("places nested bullet markers outside the item content box", () => {
    const { container } = renderMarkdown(NESTED_BULLET_MARKDOWN);

    const topList = container.querySelector("ul");
    expect(topList).not.toBeNull();
    expect(topList?.className).toContain("list-outside");
    expect(topList?.className).not.toContain("list-inside");
    expect(topList?.className).toContain("pl-6");

    const topItems = directChildren(topList!, "li");
    expect(topItems).toHaveLength(3);
    expect(
      topItems.map((item) => item.querySelector("strong")?.textContent),
    ).toEqual([
      "Track and debug LLM calls",
      "Evaluate quality",
      "Monitor in production",
    ]);

    for (const item of topItems) {
      const nested = item.querySelector(":scope > ul");
      expect(nested).not.toBeNull();
      expect(nested?.className).toContain("pl-6");
      expect(item.className).not.toContain("[&>ul]:pl-4");
    }
  });

  it("places nested numbered-list markers outside the item content box", () => {
    const { container } = renderMarkdown(NESTED_ORDERED_MARKDOWN);

    const topList = container.querySelector("ol");
    expect(topList).not.toBeNull();
    expect(topList?.className).toContain("list-outside");
    expect(topList?.className).not.toContain("list-inside");
    expect(topList?.className).toContain("pl-6");

    const topItems = directChildren(topList!, "li");
    expect(topItems).toHaveLength(2);

    for (const item of topItems) {
      const nested = item.querySelector(":scope > ol");
      expect(nested).not.toBeNull();
      expect(nested?.className).toContain("pl-6");
      expect(item.className).not.toContain("[&>ol]:pl-4");
    }
  });

  it("does not emit an empty trailing list item for a nested bullet list", () => {
    const { container } = renderMarkdown(NESTED_BULLET_MARKDOWN);
    const topItems = directChildren(container.querySelector("ul")!, "li");

    expect(
      topItems.every((item) => (item.textContent ?? "").trim().length > 0),
    ).toBe(true);
  });
});

describe("MarkdownView code blocks", () => {
  // A random React key (and an inline `code` renderer, which is a new
  // component type every parent render) remounted CodeBlock and dropped
  // local state such as the copy-button checkmark and scroll position.
  it("reuses the same code block instance across re-renders", () => {
    const markdown = "```js\nconst x = 1;\n```";
    const { container, rerender } = render(
      <MarkdownContextProvider>
        <MarkdownView markdown={markdown} />
      </MarkdownContextProvider>,
    );

    const codeblock = container.querySelector(".codeblock");
    expect(codeblock).not.toBeNull();

    rerender(
      <MarkdownContextProvider>
        <MarkdownView markdown={markdown} />
      </MarkdownContextProvider>,
    );

    expect(container.querySelector(".codeblock")).toBe(codeblock);
  });

  it("renders two identical fenced blocks as distinct instances", () => {
    const { container } = renderMarkdown(
      "```js\nconst x = 1;\n```\n\n```js\nconst x = 1;\n```",
    );

    expect(container.querySelectorAll(".codeblock")).toHaveLength(2);
  });
});

describe("prependBasePathToInternalHref", () => {
  // A native <a> loses the NEXT_PUBLIC_BASE_PATH that <Link> used to prepend to
  // root-relative internal hrefs; this helper restores it for subpath deploys.
  it("prepends the base path to a root-relative internal href", () => {
    expect(
      prependBasePathToInternalHref("/project/abc/traces/def", "/lf"),
    ).toBe("/lf/project/abc/traces/def");
  });

  it("is a no-op when no base path is configured", () => {
    expect(prependBasePathToInternalHref("/project/abc", "")).toBe(
      "/project/abc",
    );
  });

  it("leaves absolute URLs untouched", () => {
    expect(
      prependBasePathToInternalHref("https://example.com/page", "/lf"),
    ).toBe("https://example.com/page");
    expect(prependBasePathToInternalHref("mailto:a@b.com", "/lf")).toBe(
      "mailto:a@b.com",
    );
  });

  it("leaves protocol-relative, hash, search and dot-relative refs untouched", () => {
    expect(prependBasePathToInternalHref("//evil.example.com", "/lf")).toBe(
      "//evil.example.com",
    );
    expect(prependBasePathToInternalHref("#section", "/lf")).toBe("#section");
    expect(prependBasePathToInternalHref("?tab=io", "/lf")).toBe("?tab=io");
    expect(prependBasePathToInternalHref("./sibling", "/lf")).toBe("./sibling");
  });
});
