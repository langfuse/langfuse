import { renderHook } from "@testing-library/react";
import type { Mock } from "vitest";
import type { SessionContextValue } from "next-auth/react";
import { useRouter } from "next/router";

import { useAuthGuard } from "@/src/components/layouts/app-layout/hooks/useAuthGuard";

vi.mock("next/router", () => ({
  useRouter: vi.fn(),
}));

const DATASET_ITEMS_PATTERN = "/project/[projectId]/datasets/[datasetId]/items";

function mockRouter(
  overrides: {
    pathname?: string;
    asPath?: string;
    query?: Record<string, string | undefined>;
    isReady?: boolean;
  } = {},
) {
  (useRouter as Mock).mockReturnValue({
    pathname: overrides.pathname ?? "/",
    asPath: overrides.asPath ?? overrides.pathname ?? "/",
    query: overrides.query ?? {},
    isReady: overrides.isReady ?? true,
  });
}

function unauthenticated(): SessionContextValue {
  return {
    status: "unauthenticated",
    data: null,
    update: vi.fn(),
  };
}

function authenticated(): SessionContextValue {
  return {
    status: "authenticated",
    data: { user: { id: "u1", email: "a@b.c" } } as SessionContextValue["data"],
    update: vi.fn(),
  };
}

describe("useAuthGuard", () => {
  test("waits for router hydration before storing asPath on a protected route", () => {
    // First client render of a statically-optimized dynamic page: asPath is
    // still the route pattern. Capturing it as targetPath makes the post-login
    // router.replace throw href-interpolation-failed.
    mockRouter({
      pathname: DATASET_ITEMS_PATTERN,
      asPath: DATASET_ITEMS_PATTERN,
      isReady: false,
    });

    const { result } = renderHook(() => useAuthGuard(unauthenticated(), false));

    expect(result.current).toEqual({ action: "loading", message: "Loading" });
  });

  test("stores the hydrated asPath once the router is ready", () => {
    mockRouter({
      pathname: DATASET_ITEMS_PATTERN,
      asPath: "/project/p1/datasets/ds1/items",
      isReady: true,
    });

    const { result } = renderHook(() => useAuthGuard(unauthenticated(), false));

    expect(result.current).toEqual({
      action: "redirect",
      url: `/auth/sign-in?targetPath=${encodeURIComponent("/project/p1/datasets/ds1/items")}`,
      message: "Redirecting",
    });
  });

  test("does not store an uninterpolated asPath even when isReady", () => {
    mockRouter({
      pathname: DATASET_ITEMS_PATTERN,
      asPath: DATASET_ITEMS_PATTERN,
      isReady: true,
    });

    const { result } = renderHook(() => useAuthGuard(unauthenticated(), false));

    expect(result.current).toEqual({
      action: "redirect",
      url: "/auth/sign-in",
      message: "Redirecting",
    });
  });

  test("recomputes when isReady flips on the same router object", () => {
    const router = {
      pathname: DATASET_ITEMS_PATTERN,
      asPath: DATASET_ITEMS_PATTERN,
      query: {},
      isReady: false,
    };
    (useRouter as Mock).mockReturnValue(router);

    const session = unauthenticated();
    const { result, rerender } = renderHook(() => useAuthGuard(session, false));

    expect(result.current.action).toBe("loading");

    router.isReady = true;
    router.asPath = "/project/p1/datasets/ds1/items";
    rerender();

    expect(result.current).toEqual({
      action: "redirect",
      url: `/auth/sign-in?targetPath=${encodeURIComponent("/project/p1/datasets/ds1/items")}`,
      message: "Redirecting",
    });
  });

  test("does not redirect an authenticated user to an uninterpolated route pattern", () => {
    mockRouter({
      pathname: "/auth/sign-in",
      asPath: `/auth/sign-in?targetPath=${encodeURIComponent(DATASET_ITEMS_PATTERN)}`,
      query: { targetPath: DATASET_ITEMS_PATTERN },
      isReady: true,
    });

    const { result } = renderHook(() => useAuthGuard(authenticated(), false));

    expect(result.current).toEqual({
      action: "redirect",
      url: "/",
      message: "Redirecting",
    });
  });

  test("redirects an authenticated user on sign-in to a hydrated targetPath", () => {
    mockRouter({
      pathname: "/auth/sign-in",
      asPath: `/auth/sign-in?targetPath=${encodeURIComponent("/project/p1/datasets/ds1/items")}`,
      query: { targetPath: "/project/p1/datasets/ds1/items" },
      isReady: true,
    });

    const { result } = renderHook(() => useAuthGuard(authenticated(), false));

    expect(result.current).toEqual({
      action: "redirect",
      url: "/project/p1/datasets/ds1/items",
      message: "Redirecting",
    });
  });
});
