import {
  buildEventsTablePathForObservationType,
  buildEventsTablePathForSpanName,
} from "@/src/features/events/lib/eventsTablePaths";

describe("buildEventsTablePathForSpanName", () => {
  it("opens the observations table with a name filter", () => {
    const result = buildEventsTablePathForSpanName({
      currentPath:
        "/project/project-1/observations/new?dateRange=last7d&peek=obs-1&traceId=trace-1&timestamp=2026-03-08T18%3A27%3A00.703Z",
      projectId: "project-1",
      spanName: "Session Evaluation",
    });

    const url = new URL(result, "https://langfuse.local");

    expect(url.pathname).toBe("/project/project-1/observations");
    expect(url.searchParams.get("dateRange")).toBe("last7d");
    expect(url.searchParams.get("filter")).toBe(
      "name;stringOptions;;any of;Session%20Evaluation",
    );
  });

  it("clears search, saved view, and replaces existing filters", () => {
    const result = buildEventsTablePathForSpanName({
      currentPath:
        "/project/project-1/observations/new?filter=traceId%3Bstring%3B%3Bcontains%3Btrace-1&search=foo&searchType=id&page=4&viewId=view-1&limit=100",
      projectId: "project-1",
      spanName: "bullmq.consumer",
    });

    const url = new URL(result, "https://langfuse.local");

    expect(url.pathname).toBe("/project/project-1/observations");
    expect(url.searchParams.get("filter")).toBe(
      "name;stringOptions;;any of;bullmq.consumer",
    );
    expect(url.searchParams.get("search")).toBeNull();
    expect(url.searchParams.get("searchType")).toBeNull();
    expect(url.searchParams.get("page")).toBeNull();
    expect(url.searchParams.get("limit")).toBeNull();
    expect(url.searchParams.get("viewId")).toBeNull();
  });

  it("works from the trace detail route and removes trace-specific params", () => {
    const result = buildEventsTablePathForSpanName({
      currentPath:
        "/project/project-1/traces/trace-1?observation=obs-1&traceTab=log&pref=json",
      projectId: "project-1",
      spanName: "Session Evaluation",
    });

    const url = new URL(result, "https://langfuse.local");

    expect(url.pathname).toBe("/project/project-1/observations");
    expect(url.searchParams.get("filter")).toBe(
      "name;stringOptions;;any of;Session%20Evaluation",
    );
    expect(url.searchParams.get("observation")).toBeNull();
    expect(url.searchParams.get("traceTab")).toBeNull();
    expect(url.searchParams.get("pref")).toBeNull();
  });

  it("builds a type filter for the observations table", () => {
    const result = buildEventsTablePathForObservationType({
      currentPath: "/project/project-1/traces/trace-1?observation=obs-1",
      projectId: "project-1",
      observationType: "GENERATION",
    });

    const url = new URL(result, "https://langfuse.local");

    expect(url.pathname).toBe("/project/project-1/observations");
    expect(url.searchParams.get("filter")).toBe(
      "type;stringOptions;;any of;GENERATION",
    );
  });
});
