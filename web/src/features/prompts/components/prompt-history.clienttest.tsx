import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { Command } from "@/src/components/ui/command";
import { PromptHistoryNode } from "./prompt-history";
import { type RouterOutputs } from "@/src/utils/api";

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    pathname: "/project/p1/prompts/my-prompt",
    query: { projectId: "p1" },
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ prompts: { invalidate: vi.fn() } }),
    prompts: {
      allLabels: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
      setLabels: {
        useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
      },
    },
  },
}));

type PromptVersion =
  RouterOutputs["prompts"]["allVersions"]["promptVersions"][number];

// Builds `count` versions ordered latest-first (version N down to 1), matching
// the server's `orderBy: [{ version: "desc" }]` in promptRouter.ts.
const buildPromptVersions = (count: number): PromptVersion[] =>
  Array.from({ length: count }, (_, i) => {
    const version = count - i;
    return {
      id: `prompt-${version}`,
      projectId: "p1",
      name: "my-prompt",
      version,
      type: "text",
      prompt: { text: `Hello v${version}` },
      config: {},
      labels: version === count ? ["production"] : [],
      tags: [],
      commitMessage: `commit message for v${version}`,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: "API",
      creator: undefined,
    } as unknown as PromptVersion;
  });

// Renders PromptHistoryNode the way prompt-detail.tsx does: inside a Command
// root (cmdk requires it) whose own DOM node is the virtualizer's scroll
// container.
const renderHistory = (
  props: Partial<React.ComponentProps<typeof PromptHistoryNode>> & {
    prompts: PromptVersion[];
  },
) => {
  const Wrapper = () => {
    const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
    return (
      <Command ref={setScrollNode} shouldFilter={false}>
        <PromptHistoryNode
          currentPromptVersion={undefined}
          setCurrentPromptVersion={vi.fn()}
          scrollElement={scrollNode}
          {...props}
        />
      </Command>
    );
  };
  return render(<Wrapper />);
};

describe("PromptHistoryNode", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    // jsdom never computes real layout, so the scroll container the
    // virtualizer measures (via `element.offsetHeight`/`offsetWidth`) always
    // reports 0, which the virtualizer reads as "nothing is visible" -- it
    // would render zero rows, making these tests vacuously pass. Report a
    // realistic viewport size instead, the way a real browser would.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 400,
    });
  });

  it("virtualizes a large version history instead of mounting every row", () => {
    // Regression test: allVersions previously had no default page/limit, and
    // this sidebar rendered every returned version into the DOM unbounded,
    // freezing the tab for prompts with hundreds/thousands of versions.
    const prompts = buildPromptVersions(500);
    renderHistory({ prompts });

    // The latest version (first in the server-ordered list) is within the
    // virtualizer's initial window and must be visible.
    expect(screen.getByText("# 500")).toBeInTheDocument();

    // A version far down the (unfiltered) list must NOT be mounted: jsdom
    // reports a zero-height scroll container, so only a small window near
    // the top plus overscan is ever rendered.
    expect(screen.queryByText("# 1")).not.toBeInTheDocument();

    // The number of mounted version badges must stay far below the total
    // version count -- this is the bounded-DOM guarantee virtualization
    // provides.
    const renderedBadges = screen.getAllByText(/^# \d+$/);
    expect(renderedBadges.length).toBeLessThan(50);
    expect(renderedBadges.length).toBeLessThan(prompts.length);
  });

  it("filters across the full version list by search term, not just the mounted window", () => {
    const prompts = buildPromptVersions(5);
    renderHistory({ prompts, searchValue: "v3" });

    expect(screen.getByText("# 3")).toBeInTheDocument();
    expect(screen.queryByText("# 1")).not.toBeInTheDocument();
    expect(screen.queryByText("# 2")).not.toBeInTheDocument();
    expect(screen.queryByText("# 4")).not.toBeInTheDocument();
    expect(screen.queryByText("# 5")).not.toBeInTheDocument();
  });

  it("still treats the true latest version as 'clear selection', even while a search hides it", () => {
    const prompts = buildPromptVersions(5);
    const setCurrentPromptVersion = vi.fn();
    // Search narrows the mounted rows to version 3 only, which is NOT the
    // latest (version 5). Clicking it must select version 3 explicitly, not
    // clear the selection -- proves `isLatest` is derived from the
    // unfiltered list, not from position within the filtered/mounted rows.
    renderHistory({
      prompts,
      searchValue: "v3",
      setCurrentPromptVersion,
    });

    fireEvent.click(screen.getByText("# 3"));
    expect(setCurrentPromptVersion).toHaveBeenCalledWith(3);
  });
});
