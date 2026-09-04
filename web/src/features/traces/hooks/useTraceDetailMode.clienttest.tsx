import { act, renderHook, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { useTraceDetailMode } from "@/src/features/traces/hooks/useTraceDetailMode";

vi.mock("next/router", () => ({ useRouter: vi.fn() }));

describe("useTraceDetailMode", () => {
  const replace = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    (useRouter as Mock).mockReturnValue({
      pathname: "/project/[projectId]/traces/[traceId]",
      query: {
        projectId: "project-1",
        traceId: "trace-1",
        aggregation: "observation",
      },
      replace,
    });
  });

  it("selects a default observation when observation mode is opened directly", async () => {
    renderHook(() =>
      useTraceDetailMode({
        trace: {
          id: "trace-1",
          rootObservationId: "observation-1",
          observations: [
            { id: "observation-1", traceId: "trace-1", type: "SPAN" },
          ],
        },
      }),
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        {
          pathname: "/project/[projectId]/traces/[traceId]",
          query: {
            projectId: "project-1",
            traceId: "trace-1",
            aggregation: "observation",
            observation: "observation-1",
          },
        },
        undefined,
        { shallow: true },
      ),
    );
  });

  it("moves to the selected observation's trace when leaving session mode", () => {
    (useRouter as Mock).mockReturnValue({
      pathname: "/project/[projectId]/traces/[traceId]",
      query: {
        projectId: "project-1",
        traceId: "trace-1",
        aggregation: "session",
        observation: "trace-2:observation-2",
      },
      replace,
    });
    const { result } = renderHook(() =>
      useTraceDetailMode({
        trace: {
          id: "trace-1",
          observations: [
            { id: "observation-2", traceId: "trace-2", type: "SPAN" },
          ],
        },
      }),
    );

    act(() => result.current.setMode("observation"));

    expect(replace).toHaveBeenCalledWith(
      {
        pathname: "/project/[projectId]/traces/[traceId]",
        query: {
          projectId: "project-1",
          traceId: "trace-2",
          aggregation: "observation",
          observation: "observation-2",
        },
      },
      undefined,
      { shallow: true },
    );
  });
});
