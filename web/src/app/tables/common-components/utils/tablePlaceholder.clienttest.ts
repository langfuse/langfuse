// @vitest-environment node

import { QueryClient, QueryObserver } from "@tanstack/react-query";
import {
  tablePlaceholderOptions,
  type TableDataScope,
} from "./tablePlaceholder";

const scope = {
  projectId: "project-a",
  filter: [{ column: "name", type: "string", operator: "=", value: "A" }],
  searchQuery: "test",
  searchType: ["id"],
  timeRange: { range: "last1Day" },
} satisfies TableDataScope;

const queryOptions = (identity: TableDataScope, input: unknown) => ({
  queryKey: ["rows", input],
  queryFn: () => new Promise<string[]>(() => {}),
  ...tablePlaceholderOptions(identity),
});

describe("table placeholders", () => {
  it("drops rows when their project, filters, search, or chosen time range changes", () => {
    const changes: TableDataScope[] = [
      { ...scope, projectId: "project-b" },
      { ...scope, filter: [{ ...scope.filter[0]!, value: "B" }] },
      { ...scope, searchQuery: "other" },
      { ...scope, searchType: ["content"] },
      { ...scope, timeRange: { range: "last7Days" } },
      {
        ...scope,
        filter: [
          ...scope.filter,
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      },
    ];

    for (const next of changes) {
      const client = new QueryClient();
      const initial = queryOptions(scope, "A");
      client.setQueryData(initial.queryKey, ["A"]);
      const observer = new QueryObserver(client, initial);
      observer.setOptions(queryOptions(next, "B"));

      expect(observer.getCurrentResult().isPending).toBe(true);
      expect(observer.getCurrentResult().data).toBeUndefined();
      observer.destroy();
      client.clear();
    }
  });

  it("does not revive A while switching from pending B to pending C", () => {
    const client = new QueryClient();
    const initial = queryOptions(scope, "A");
    client.setQueryData(initial.queryKey, ["A"]);
    const observer = new QueryObserver(client, initial);

    for (const name of ["B", "C"]) {
      observer.setOptions(
        queryOptions(
          { ...scope, filter: [{ ...scope.filter[0]!, value: name }] },
          name,
        ),
      );
      expect(observer.getCurrentResult().data).toBeUndefined();
      expect(observer.getCurrentResult().isPending).toBe(true);
    }

    observer.destroy();
    client.clear();
  });

  it("keeps rows across page, sort and resolved-window changes in the same scope", () => {
    const client = new QueryClient();
    const initial = queryOptions(scope, { page: 1 });
    client.setQueryData(initial.queryKey, ["A"]);
    const observer = new QueryObserver(client, initial);

    for (const input of [
      { page: 2 },
      { page: 2, orderBy: { column: "name", order: "ASC" } },
      { page: 2, from: new Date("2026-01-02T00:00:00Z") },
    ]) {
      observer.setOptions(queryOptions({ ...scope }, input));
      expect(observer.getCurrentResult().data).toEqual(["A"]);
      expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    }

    observer.destroy();
    client.clear();
  });

  it("keeps a disabled dependent query from relabeling the last populated batch", () => {
    const client = new QueryClient();
    const initial = queryOptions(scope, { ids: ["A"] });
    client.setQueryData(initial.queryKey, ["A input"]);
    const observer = new QueryObserver(client, initial);
    const nextScope = { ...scope, searchQuery: "other" };

    observer.setOptions({
      ...queryOptions(nextScope, null),
      enabled: false,
    });
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(
      client.getQueryCache().find({ queryKey: initial.queryKey })?.meta,
    ).toEqual({ tableDataScope: scope });

    observer.setOptions(queryOptions(nextScope, { ids: ["B"] }));
    expect(observer.getCurrentResult().data).toBeUndefined();

    observer.destroy();
    client.clear();
  });
});
