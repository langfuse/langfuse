import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// Mock the use-query-params library. The mock provides a controllable
// queryParamStore map that the hook reads from / writes to, mirroring the
// pattern used by useSidebarFilterState.clienttest.tsx for the same
// library.
const queryParamStore = new Map<string, string | undefined>();

vi.mock("use-query-params", () => ({
  useQueryParam: (key: string) => {
    const initial = queryParamStore.has(key)
      ? queryParamStore.get(key)
      : undefined;
    const [value, setValue] = React.useState<string | undefined>(initial);
    const setQueryValue = React.useCallback(
      (next: string | undefined) => {
        setValue(next);
        if (next === undefined || next === "") {
          queryParamStore.delete(key);
        } else {
          queryParamStore.set(key, next);
        }
      },
      [key],
    );
    return [value, setQueryValue];
  },
  StringParam: {},
}));

// Mock useRouter. isReady defaults to true so the hook treats the URL as
// authoritative in tests; individual tests can flip it via setRouterReady.
let routerIsReady = true;
vi.mock("next/router", () => ({
  useRouter: () => ({ isReady: routerIsReady }),
}));

import { useEnvironmentFilter } from "@/src/hooks/useEnvironmentFilter";

const PROJECT = "test-project";
const PROJECT_KEY = `langfuse-environment-visibility-${PROJECT}`;

describe("useEnvironmentFilter", () => {
  beforeEach(() => {
    queryParamStore.clear();
    localStorage.clear();
    routerIsReady = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to localStorage + default visibility when URL has no envs", () => {
    localStorage.setItem(
      PROJECT_KEY,
      JSON.stringify({ default: true, langfuse: false, prod: true }),
    );

    const { result } = renderHook(() =>
      useEnvironmentFilter(["default", "langfuse", "prod"], PROJECT),
    );

    // "langfuse-*" is hidden by default; "default" and "prod" explicitly true.
    expect(result.current.selectedEnvironments.sort()).toEqual([
      "default",
      "prod",
    ]);
  });

  it("URL is authoritative when present: hides a localStorage-visible env", () => {
    localStorage.setItem(
      PROJECT_KEY,
      JSON.stringify({ prod: true, staging: true }),
    );
    queryParamStore.set("environments", "prod");

    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod", "staging"], PROJECT),
    );

    // URL says only "prod" — localStorage's "staging" is overridden.
    expect(result.current.selectedEnvironments).toEqual(["prod"]);
  });

  it("URL is authoritative when present: shows a localStorage-hidden env", () => {
    localStorage.setItem(
      PROJECT_KEY,
      JSON.stringify({ prod: true, staging: false }),
    );
    queryParamStore.set("environments", "prod,staging");

    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod", "staging"], PROJECT),
    );

    expect(result.current.selectedEnvironments.sort()).toEqual([
      "prod",
      "staging",
    ]);
  });

  it("URL entry referencing a deleted env is silently filtered out", () => {
    queryParamStore.set("environments", "prod,deleted-env");

    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod"], PROJECT),
    );

    // "deleted-env" is not in availableEnvironments — it should not surface.
    expect(result.current.selectedEnvironments).toEqual(["prod"]);
  });

  it("empty URL string is treated as no URL (localStorage fallback)", () => {
    queryParamStore.set("environments", "");
    localStorage.setItem(
      PROJECT_KEY,
      JSON.stringify({ prod: true, staging: false }),
    );

    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod", "staging"], PROJECT),
    );

    // Empty URL = fall back to localStorage.
    expect(result.current.selectedEnvironments).toEqual(["prod"]);
  });

  it("setSelectedEnvironments writes URL-encoded values to both URL and localStorage", () => {
    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod", "us,east-1", "staging"], PROJECT),
    );

    act(() => {
      result.current.setSelectedEnvironments(["prod", "us,east-1"]);
    });

    // Comma-bearing env names get URL-encoded so they round-trip intact.
    expect(queryParamStore.get("environments")).toBe("prod,us%2Ceast-1");
    const stored = JSON.parse(localStorage.getItem(PROJECT_KEY) ?? "{}");
    expect(stored).toEqual({
      prod: true,
      "us,east-1": true,
      staging: false,
    });
  });

  it("setSelectedEnvironments([]) removes the URL param and writes empty map", () => {
    queryParamStore.set("environments", "prod");
    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod", "staging"], PROJECT),
    );

    act(() => {
      result.current.setSelectedEnvironments([]);
    });

    expect(queryParamStore.has("environments")).toBe(false);
    const stored = JSON.parse(localStorage.getItem(PROJECT_KEY) ?? "{}");
    expect(stored).toEqual({ prod: false, staging: false });
  });

  it("setSelectedEnvironments is a no-op when the selection is unchanged", () => {
    queryParamStore.set("environments", "prod,staging");
    const { result } = renderHook(() =>
      useEnvironmentFilter(["prod", "staging"], PROJECT),
    );

    // First call: nothing has changed yet — should be a no-op.
    act(() => {
      result.current.setSelectedEnvironments(["prod", "staging"]);
    });

    // URL param should be exactly what we set it to (no extra history push).
    expect(queryParamStore.get("environments")).toBe("prod,staging");
  });

  it("setSelectedEnvironments does NOT erase localStorage when availableEnvironments is empty", () => {
    localStorage.setItem(
      PROJECT_KEY,
      JSON.stringify({ prod: true, staging: true }),
    );
    const { result } = renderHook(() => useEnvironmentFilter([], PROJECT));

    act(() => {
      result.current.setSelectedEnvironments(["prod"]);
    });

    // localStorage must be untouched — writing against [] would have
    // erased the previous map.
    const stored = JSON.parse(localStorage.getItem(PROJECT_KEY) ?? "{}");
    expect(stored).toEqual({ prod: true, staging: true });
  });

  it("default visibility (langfuse-* hidden) still applies when URL is absent", () => {
    const { result } = renderHook(() =>
      useEnvironmentFilter(
        ["default", "langfuse-cloud", "langfuse-internal"],
        PROJECT,
      ),
    );

    // All envs first seen: defaults apply. "langfuse-*" prefixed envs hidden.
    expect(result.current.selectedEnvironments).toEqual(["default"]);
  });

  it("does not pollute localStorage with defaults when URL is present", () => {
    queryParamStore.set("environments", "prod");
    renderHook(() => useEnvironmentFilter(["prod"], PROJECT));

    // localStorage should remain empty — URL is authoritative, so the
    // "initialize new env with default" useEffect did not run.
    expect(localStorage.getItem(PROJECT_KEY)).toBeNull();
  });

  it("newly-discovered env does not become visible when URL is present", () => {
    queryParamStore.set("environments", "prod");

    // Start with a single env (matches the URL).
    const { result, rerender } = renderHook(
      ({ available }: { available: string[] }) =>
        useEnvironmentFilter(available, PROJECT),
      { initialProps: { available: ["prod"] } },
    );

    expect(result.current.selectedEnvironments).toEqual(["prod"]);

    // The project now exposes a second env. URL is authoritative, so
    // "staging" must NOT be auto-selected.
    rerender({ available: ["prod", "staging"] });

    expect(result.current.selectedEnvironments).toEqual(["prod"]);
    // localStorage should not have been written either.
    expect(localStorage.getItem(PROJECT_KEY)).toBeNull();
  });

  it("falls back to localStorage until router.isReady (hydration gap)", () => {
    localStorage.setItem(
      PROJECT_KEY,
      JSON.stringify({ prod: true, staging: false }),
    );
    queryParamStore.set("environments", "prod,staging");

    // Simulate pre-hydration: useQueryParam has the URL value, but the
    // router is not ready yet. The hook should defer to localStorage to
    // avoid a one-frame flash of the wrong filter.
    routerIsReady = false;
    const { result, rerender } = renderHook(() =>
      useEnvironmentFilter(["prod", "staging"], PROJECT),
    );

    // localStorage says only "prod" is visible.
    expect(result.current.selectedEnvironments).toEqual(["prod"]);

    // After hydration the URL becomes authoritative.
    routerIsReady = true;
    rerender();

    expect(result.current.selectedEnvironments.sort()).toEqual([
      "prod",
      "staging",
    ]);
  });
});
