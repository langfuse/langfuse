import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { type SavedDashboardBlock } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { createMultiQueryConfig } from "./multi-query/multiQueryModel";
import { useDashboardBlocksData } from "./useDashboardBlocksData";

vi.mock("@/src/utils/trpcErrorToast", () => ({ trpcErrorToast: vi.fn() }));

it("reads saved blocks without authoring opt-in, isolates scope changes, and retains the settled fallback during retry", async () => {
  let queryClient: QueryClient | undefined;
  const reads: {
    projectId: string;
    dashboardId: string;
    resolve: (blocks?: SavedDashboardBlock[], status?: number) => void;
  }[] = [];
  let capabilityReads = 0;
  const blocks: SavedDashboardBlock[] = [
    {
      id: "note",
      kind: "markdown",
      revision: 1,
      beforePlacementId: null,
      config: { version: 1, title: "Note", content: "Context" },
    },
    {
      id: "chart",
      kind: "multiQuery",
      revision: 1,
      beforePlacementId: null,
      config: createMultiQueryConfig(),
    },
  ];
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url) => {
      const request = new URL(String(url), "http://localhost");
      const batch = request.searchParams.has("batch");
      const payload = JSON.parse(request.searchParams.get("input") ?? "{}");
      const input = batch ? payload[0].json : payload.json;
      const respond = (
        data?: unknown,
        status = data === undefined ? 500 : 200,
      ) => {
        const response =
          data === undefined
            ? {
                error: {
                  json: {
                    message: "Read failed",
                    code: -32603,
                    data: {
                      code:
                        status === 403 ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
                      httpStatus: status,
                      path: "dashboard.getDashboardBlocks",
                    },
                  },
                },
              }
            : { result: { data: { json: data } } };
        return new Response(JSON.stringify(batch ? [response] : response), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      };
      if (
        request.pathname.includes("dashboard.getDashboardBlockCapabilities")
      ) {
        capabilityReads++;
        return respond({ multiQuery: true, markdown: true });
      }
      if (!request.pathname.includes("dashboard.getDashboardBlocks"))
        throw new Error("Unexpected query");
      return new Promise<Response>((resolve) =>
        reads.push({
          ...input,
          resolve: (data, status) => resolve(respond(data, status)),
        }),
      );
    });
  const Page = api.withTRPC(() => {
    queryClient = useQueryClient();
    const [scope, setScope] = useState({
      projectId: "project",
      dashboardId: "dashboard",
    });
    const [dashboardReady, setDashboardReady] = useState(false);
    const state = useDashboardBlocksData({
      ...scope,
      canEdit: true,
      readPath: "v4",
      widgets: [],
      dashboardReady,
      hasDashboardBlocks: dashboardReady ? true : undefined,
      authoringEnabled: false,
    });
    return (
      <>
        <button onClick={() => setDashboardReady(true)}>
          Resolve dashboard
        </button>
        <button
          onClick={() =>
            setScope({
              projectId: "other-project",
              dashboardId: "other-dashboard",
            })
          }
        >
          Change scope
        </button>
        <output data-testid="state">
          {JSON.stringify({
            pending: state.blocksPending,
            blocks: state.blocks.map((block) => block.id),
            failed: state.loadError,
          })}
        </output>
      </>
    );
  });
  const value = () => JSON.parse(screen.getByTestId("state").textContent!);
  const changeKinds = (
    projectId: string,
    capabilities: { multiQuery: boolean; markdown: boolean },
  ) =>
    act(() => {
      queryClient!.setQueryData(
        getQueryKey(
          api.dashboard.getDashboardBlockCapabilities,
          { projectId },
          "query",
        ),
        capabilities,
      );
    });
  const view = render(<Page />);
  try {
    expect(reads).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Resolve dashboard" }));
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(value().pending).toBe(true);
    act(() => reads[0]!.resolve(blocks));
    await waitFor(() => expect(value().blocks).toEqual(["note", "chart"]));
    expect(capabilityReads).toBe(0);
    expect(reads[0]).toHaveProperty("includeConvertedPresets", true);
    expect(reads[0]).not.toHaveProperty("kinds");
    changeKinds("project", { multiQuery: false, markdown: false });
    expect(value()).toMatchObject({
      pending: false,
      blocks: ["note", "chart"],
    });
    expect(reads).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Change scope" }));
    await waitFor(() => expect(reads).toHaveLength(2));
    expect(reads[1]!.projectId).toBe("other-project");
    expect(value()).toMatchObject({ pending: true, blocks: [] });
    act(() => reads[1]!.resolve());
    await waitFor(() =>
      expect(value()).toMatchObject({
        pending: false,
        failed: true,
        blocks: [],
      }),
    );
    act(() => {
      queryClient!.invalidateQueries({
        queryKey: getQueryKey(
          api.dashboard.getDashboardBlocks,
          { projectId: "other-project", dashboardId: "other-dashboard" },
          "query",
        ),
      });
    });
    await waitFor(() => expect(reads).toHaveLength(3));
    expect(value()).toMatchObject({ pending: false, blocks: [] });
    act(() => reads[2]!.resolve([blocks[0]!]));
    await waitFor(() =>
      expect(value()).toMatchObject({
        pending: false,
        blocks: ["note"],
        failed: false,
      }),
    );
    const key = getQueryKey(
      api.dashboard.getDashboardBlocks,
      {
        projectId: "other-project",
        dashboardId: "other-dashboard",
        includeConvertedPresets: true,
      },
      "query",
    );
    const refresh = async (status: number, data?: SavedDashboardBlock[]) => {
      const previous = reads.length;
      const refetch = queryClient!.invalidateQueries({ queryKey: key });
      await waitFor(() => expect(reads).toHaveLength(previous + 1));
      await act(async () => {
        reads[previous]!.resolve(data, status);
        await refetch;
      });
    };
    await refresh(500);
    await waitFor(() =>
      expect(value()).toMatchObject({ failed: true, blocks: ["note"] }),
    );
    await refresh(403);
    await waitFor(() =>
      expect(value()).toMatchObject({ failed: true, blocks: [] }),
    );
    await refresh(500);
    expect(queryClient!.getQueryData(key)).toEqual([]);
    expect(value().blocks).toEqual([]);
    await refresh(200, blocks);
    await waitFor(() =>
      expect(value()).toMatchObject({
        failed: false,
        blocks: ["note", "chart"],
      }),
    );
  } finally {
    for (const read of reads) read.resolve([]);
    view.unmount();
    queryClient?.clear();
    fetchMock.mockRestore();
  }
});

it.each([
  { hint: false, authoringEnabled: false },
  { hint: undefined, authoringEnabled: true },
])(
  "keeps the classic path immediate without probing unsupported or empty reads: $hint",
  async ({ hint, authoringEnabled }) => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected request"));
    const Page = api.withTRPC(() => {
      const state = useDashboardBlocksData({
        projectId: "classic-project",
        dashboardId: "classic-dashboard",
        canEdit: true,
        readPath: "v4",
        widgets: [
          {
            type: "preset",
            id: "future-placement",
            presetId: "future-home-card",
            x: 0,
            y: 0,
            x_size: 1,
            y_size: 1,
          },
        ],
        hasDashboardBlocks: hint,
        authoringEnabled,
      });
      return (
        <output>
          {JSON.stringify({
            pending: state.blocksPending,
            authorPending: state.capabilitiesPending,
            label: state.placementOptions[1]?.label,
            blocks: state.blocks,
          })}
        </output>
      );
    });
    const view = render(<Page />);
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.parse(view.container.textContent!)).toEqual({
        pending: false,
        authorPending: false,
        label: "Before row containing future-home-card",
        blocks: [],
      });
    } finally {
      view.unmount();
      fetchMock.mockRestore();
    }
  },
);
