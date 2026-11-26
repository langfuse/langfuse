import { expect, it } from "vitest";
import { buildSessionTracePeekNavigationPath } from "./buildSessionTracePeekNavigationPath";

it("keeps view preferences but replaces the peek item and its timestamp", () => {
  const pathname = "/project/[projectId]/traces/[traceId]";
  const url = new URL(
    buildSessionTracePeekNavigationPath(
      pathname,
      "peek=old&observation=old-observation&traceId=old-trace&timestamp=old-time&view=timeline&traceTab=metadata&pref=tree",
      { id: "next%2Ftrace", params: { timestamp: "next-time" } },
    ),
    "https://example.test",
  );

  expect(url.pathname).toBe(pathname);
  expect(Object.fromEntries(url.searchParams)).toEqual({
    peek: "next/trace",
    aggregation: "trace",
    timestamp: "next-time",
    view: "timeline",
    traceTab: "metadata",
    pref: "tree",
  });
});
