import { act, renderHook } from "@testing-library/react";
import { formatUrl } from "next/dist/shared/lib/router/utils/format-url";
import { type ParsedUrlQuery } from "querystring";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentsScope } from "./useAgentsScope";

const router = vi.hoisted(() => ({
  pathname: "/project/[projectId]/agents",
  query: {} as ParsedUrlQuery,
  isReady: true,
  replace: vi.fn(),
}));

vi.mock("next/router", () => ({ useRouter: () => router }));

let location: URL;

beforeEach(() => {
  router.query = {
    projectId: "project",
    environment: "production",
    search: "research",
    page: "2",
    runPage: "3",
    tracePage: "4",
    skillPage: "5",
  };
  router.replace.mockImplementation((url: Parameters<typeof formatUrl>[0]) => {
    location = new URL(formatUrl(url), "https://example.test");
    router.query = Object.fromEntries(location.searchParams);
    return Promise.resolve(true);
  });
});

describe("Agent scope navigation", () => {
  it("clears filters through Next URL serialization without leaving a blank environment", async () => {
    const { result, rerender } = renderHook(() => useAgentsScope("project"));
    await act(() => result.current.setEnvironment(null));
    rerender();
    expect(result.current.scope.environment).toBeNull();
    expect(result.current.enabled).toBe(true);
    for (const key of [
      "environment",
      "page",
      "runPage",
      "tracePage",
      "skillPage",
    ])
      expect(location.searchParams.has(key)).toBe(false);
    expect(location.searchParams.get("search")).toBe("research");

    await act(() => result.current.setEnvironment("production"));
    rerender();
    expect(result.current.scope.environment).toBe("production");
    await act(() =>
      result.current.update({ search: undefined, environment: undefined }),
    );
    rerender();
    expect(result.current.scope.environment).toBeNull();
    expect(location.searchParams.has("search")).toBe(false);
    expect(location.searchParams.has("environment")).toBe(false);

    router.query.environment = "";
    rerender();
    expect(result.current.scope.environment).toBeNull();
  });
});
