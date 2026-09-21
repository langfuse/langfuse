import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/components/ui/markdown-render-limits";
import {
  MarkdownRenderCharacterLimitProvider,
  useMarkdownRenderCharacterLimit,
} from "@/src/hooks/useMarkdownRenderCharacterLimit";

// vi.hoisted so it exists before the hoisted vi.mock factories run.
const { mockMarkdownRenderConfigQuery } = vi.hoisted(() => ({
  mockMarkdownRenderConfigQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    public: {
      markdownRenderConfig: {
        useQuery: mockMarkdownRenderConfigQuery,
      },
    },
  },
}));

const renderWithProvider = () =>
  renderHook(() => useMarkdownRenderCharacterLimit(), {
    wrapper: MarkdownRenderCharacterLimitProvider,
  }).result.current;

describe("useMarkdownRenderCharacterLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the server-configured limit once the provider fetched it", () => {
    mockMarkdownRenderConfigQuery.mockReturnValue({
      data: { characterLimit: 500_000 },
    });
    expect(renderWithProvider()).toBe(500_000);
  });

  it("uses the default while the query has no data and disables retries", () => {
    mockMarkdownRenderConfigQuery.mockReturnValue({
      data: undefined,
    });
    expect(renderWithProvider()).toBe(DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT);
    expect(mockMarkdownRenderConfigQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ retry: false }),
    );
  });

  it("uses the default without a provider (stories, tests)", () => {
    const { result } = renderHook(() => useMarkdownRenderCharacterLimit());
    expect(result.current).toBe(DEFAULT_MARKDOWN_RENDER_CHARACTER_LIMIT);
    expect(mockMarkdownRenderConfigQuery).not.toHaveBeenCalled();
  });
});
