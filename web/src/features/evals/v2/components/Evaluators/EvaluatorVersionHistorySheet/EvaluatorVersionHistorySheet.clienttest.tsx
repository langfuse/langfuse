import { act, render, waitFor } from "@testing-library/react";
import { afterEach, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { EvaluatorVersionHistorySheet } from "./EvaluatorVersionHistorySheet";

const originalGetClientRects = Range.prototype.getClientRects;

beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

afterAll(() => {
  Range.prototype.getClientRects = originalGetClientRects;
});

describe("EvaluatorVersionHistorySheet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads more versions when the sentinel enters the sheet viewport", () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const onLoadMore = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function (
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        intersectionCallback = callback;
        return { disconnect, observe, root: options?.root };
      }),
    );

    const { unmount } = render(
      <EvaluatorVersionHistorySheet
        open
        onOpenChange={vi.fn()}
        evaluatorName="Answer quality"
        versions={[]}
        currentVersionId="version-1"
        defaultModel={null}
        expandedVersionId={null}
        onExpandedVersionChange={vi.fn()}
        isLoading={false}
        hasMore
        isLoadingMore={false}
        onLoadMore={onLoadMore}
      />,
    );

    const sentinel = observe.mock.calls[0]?.[0] as HTMLDivElement;
    expect(sentinel).toBeInstanceOf(HTMLDivElement);

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(disconnect).toHaveBeenCalledOnce();
    expect(onLoadMore).toHaveBeenCalledOnce();

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it("does not flag saved prompt variables as disconnected", async () => {
    render(
      <TooltipProvider>
        <EvaluatorVersionHistorySheet
          open
          onOpenChange={vi.fn()}
          evaluatorName="Answer quality"
          versions={[
            {
              id: "version-1",
              version: 1,
              createdAt: new Date("2026-08-11T12:00:00Z"),
              type: "LLM_AS_JUDGE",
              sourceCode: null,
              sourceCodeLanguage: null,
              prompt: "Evaluate {{output}} against {{input}}.",
              provider: "openai",
              model: "gpt-4.1-mini",
              outputDefinition: null,
            },
          ]}
          currentVersionId="version-1"
          defaultModel={null}
          expandedVersionId="version-1"
          onExpandedVersionChange={vi.fn()}
          isLoading={false}
          hasMore={false}
          isLoadingMore={false}
          onLoadMore={vi.fn()}
        />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(document.querySelectorAll(".cm-eval-variable")).toHaveLength(2);
    });
    expect(
      document.querySelector(".cm-eval-variable-invalid"),
    ).not.toBeInTheDocument();
  });
});
