import { renderHook } from "@testing-library/react";
import { useRouter } from "next/router";
import type { Mock } from "vitest";

import {
  asSingleQueryParam,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";

vi.mock("next/router", () => ({
  useRouter: vi.fn(),
}));

function mockQuery(query: Record<string, string | string[] | undefined>) {
  (useRouter as Mock).mockReturnValue({ query, isReady: false });
}

describe("asSingleQueryParam", () => {
  test("returns undefined for missing, empty, and array values", () => {
    expect(asSingleQueryParam(undefined)).toBeUndefined();
    expect(asSingleQueryParam("")).toBeUndefined();
    expect(asSingleQueryParam(["trace-1"])).toBeUndefined();
  });

  test("returns a non-empty string as-is", () => {
    expect(asSingleQueryParam("trace-1")).toBe("trace-1");
  });
});

describe("useReadyRouteParams", () => {
  test("is not ready while the pages router has not hydrated dynamic params", () => {
    // Hard navigation / reload of a statically-optimized dynamic route: first
    // render has an empty query, so casts like `router.query.traceId as string`
    // are `undefined` at runtime.
    mockQuery({});

    const { result } = renderHook(() =>
      useReadyRouteParams(["projectId", "traceId"]),
    );

    expect(result.current).toEqual({ ready: false });
  });

  test("is not ready when any requested param is missing", () => {
    mockQuery({ projectId: "p1" });

    const { result } = renderHook(() =>
      useReadyRouteParams(["projectId", "userId"]),
    );

    expect(result.current).toEqual({ ready: false });
  });

  test("is ready with typed string params once every key is a string", () => {
    mockQuery({ projectId: "p1", userId: "u1", extra: "ignored" });

    const { result } = renderHook(() =>
      useReadyRouteParams(["projectId", "userId"]),
    );

    expect(result.current).toEqual({
      ready: true,
      params: { projectId: "p1", userId: "u1" },
    });
  });
});
