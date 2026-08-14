import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MarkdownRenderCharacterLimitProvider,
  useMarkdownRenderCharacterLimit,
} from "@/src/hooks/useMarkdownRenderCharacterLimit";

// Created via vi.hoisted so it exists before the hoisted vi.mock factories run.
const { mockMarkdownRenderConfigQuery } = vi.hoisted(() => ({
  mockMarkdownRenderConfigQuery: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    public: {
      markdownRenderConfig: {
        useQuery: (input: unknown, options: unknown) =>
          mockMarkdownRenderConfigQuery(input, options),
      },
    },
  },
}));
// Distinctive non-default value so the fallback tests fail if the module stops
// reading env and hardcodes the 150k default instead.
vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_LANGFUSE_MARKDOWN_RENDER_CHARACTER_LIMIT: 42_000 },
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
      isLoading: false,
    });
    expect(renderWithProvider()).toBe(500_000);
  });

  it("falls back to the build-time value while the query has no data", () => {
    mockMarkdownRenderConfigQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    expect(renderWithProvider()).toBe(42_000);
  });

  it("defaults to the build-time value without a provider (stories, tests)", () => {
    const { result } = renderHook(() => useMarkdownRenderCharacterLimit());
    expect(result.current).toBe(42_000);
    expect(mockMarkdownRenderConfigQuery).not.toHaveBeenCalled();
  });
});
