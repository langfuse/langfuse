import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { api } from "@/src/utils/api";
import { createStudioWidget } from "./catalog";
import { useStudioWidgetResult } from "./useStudioWidgetResult";

afterEach(cleanup);

it("executes current mode only through production queries, preserves empty means and respects hidden modes", async () => {
  const config = createStudioWidget();
  config.executionMode = "current";
  config.queries[0] = {
    ...config.queries[0]!,
    view: "scores-numeric",
    metrics: [{ id: "mean", measure: "value", aggregation: "avg" }],
    filters: [
      {
        column: "name",
        type: "stringOptions",
        operator: "any of",
        value: ["quality"],
      },
    ],
  };
  config.display = { chartType: "LINE_TIME_SERIES", timeSeries: true };
  const requests: string[] = [];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      requests.push(url.pathname);
      const payload = {
        result: {
          data: {
            json: [
              { time_dimension: "2026-11-01", avg_value: 0, count_count: 0 },
              { time_dimension: "2026-11-02", avg_value: 0, count_count: 2 },
            ],
          },
        },
      };
      return new Response(
        JSON.stringify(url.searchParams.has("batch") ? [payload] : payload),
        { headers: { "Content-Type": "application/json" } },
      );
    });
  const Page = api.withTRPC(() => {
    const [enabled, setEnabled] = useState(false);
    const [title, setTitle] = useState("Scores");
    const { result } = useStudioWidgetResult(
      { ...config, title },
      {
        projectId: "project",
        readPath: "v4",
        dateRange: {
          from: new Date("2026-11-01"),
          to: new Date("2026-11-03"),
        },
        filterState: [],
        enabled,
      },
    );
    return (
      <div>
        <p>
          {result.error?.message ??
            JSON.stringify(result.data?.rows.map((row) => row.value))}
        </p>
        <button
          onClick={() => {
            result.refetch();
          }}
        >
          Run
        </button>
        <button onClick={() => setEnabled(true)}>Enable</button>
        <button onClick={() => setTitle("A clearer title")}>Rename</button>
      </div>
    );
  });
  try {
    render(<Page />);
    await act(async () => {});
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await screen.findByText("[null,0]");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("dashboard.executeQuery");
    expect(requests[0]).not.toContain("dashboardStudio.execute");
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await act(async () => {});
    expect(requests).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(requests).toHaveLength(2));
  } finally {
    fetch.mockRestore();
  }
});
