import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_METADATA_KEYS as K } from "../../features/agents/api";

vi.mock("../../features/agents/server", () => ({
  getAgentDetail: vi.fn(),
  getAgentRuns: vi.fn(),
}));
import { getAgentDetail, getAgentRuns } from "../../features/agents/server";
import { seedAgentsMvpLegacyApi } from "../../../scripts/seeder/scenarios/agents-mvp-legacy-api";

const ctx = {
  projectId: "fixture-project",
  environment: "local",
  seed: 42,
  idPrefix: "agents-legacy-api-test",
  dryRun: false,
  baseUrl: "http://localhost:3017",
  log() {},
};
const rootId = `${ctx.idPrefix}-legacy-api-root`;
const childId = `${ctx.idPrefix}-legacy-api-child`;
const modelId = `${ctx.idPrefix}-legacy-api-model`;
const agentId = `${ctx.idPrefix}:legacy-research`;
const rootName = `${ctx.idPrefix} legacy coordinator`;
const childName = `${ctx.idPrefix} legacy research`;
const observationRows = [
  {
    id: rootId,
    type: "AGENT",
    metadata: {
      [K.name]: rootName,
      [K.runId]: rootId,
      [K.source]: "span-name",
    },
  },
  {
    id: childId,
    type: "AGENT",
    metadata: {
      [K.id]: agentId,
      [K.name]: childName,
      [K.runId]: childId,
      [K.source]: "gen-ai",
    },
  },
  {
    id: modelId,
    type: "GENERATION",
    metadata: { [K.id]: agentId, [K.name]: childName, [K.runId]: childId },
  },
  { id: `${ctx.idPrefix}-legacy-api-plain`, type: "SPAN", metadata: {} },
];
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Agents MVP legacy JSON API fixture", () => {
  it("uses ordinary public JSON events and verifies queued metadata plus native run accounting", async () => {
    const fetcher = vi.fn().mockImplementation(async (url, init) => {
      if (String(url).endsWith("/projects"))
        return Response.json({ data: [{ id: ctx.projectId }] });
      if (init.method === "POST")
        return Response.json({ errors: [] }, { status: 207 });
      return Response.json({ data: observationRows });
    });
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getAgentDetail).mockImplementation(async ({ identity }) => {
      if (identity.kind === "id")
        return {
          stats: { runs: 1, modelCalls: 1, inputTokens: 3, outputTokens: 2 },
        } as Awaited<ReturnType<typeof getAgentDetail>>;
      if (identity.value === rootName)
        return { stats: { runs: 1, modelCalls: 0 } } as Awaited<
          ReturnType<typeof getAgentDetail>
        >;
      return null;
    });
    const runRows = [{ id: childId, modelCalls: 1 }];
    vi.mocked(getAgentRuns).mockImplementation(
      async ({ page, pageSize }) =>
        ({
          items: runRows.slice(page * pageSize, (page + 1) * pageSize),
          totalCount: runRows.length,
          page,
          pageSize,
        }) as Awaited<ReturnType<typeof getAgentRuns>>,
    );
    vi.useFakeTimers();
    const pending = seedAgentsMvpLegacyApi(ctx, "2026-11-05").then(
      (result) => ({ result, error: undefined }),
      (error: Error) => ({ result: undefined, error }),
    );
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    const { result, error } = await pending;
    expect(error).toBeUndefined();
    expect(result?.verified).toEqual({
      observations: 4,
      runs: 2,
      ownedModelCalls: 1,
    });
    const writes = fetcher.mock.calls.filter(
      ([, init]) => init.method === "POST",
    );
    expect(writes).toHaveLength(1);
    const batch = JSON.parse(writes[0][1].body).batch;
    expect(batch).toHaveLength(5);
    expect(batch[1]).toMatchObject({
      type: "agent-create",
      body: { id: rootId, name: rootName },
    });
    expect(batch[1].body.metadata).toBeUndefined();
    expect(batch[2].body.metadata).toEqual({
      "gen_ai.agent.id": agentId,
      "gen_ai.agent.name": childName,
      "langfuse.agent.run_id": rootId,
    });
    expect(batch[3].body.metadata["langfuse.agent.run_id"]).toBe(childId);
    expect(batch[3].body.startTime).toBe("2026-11-05T12:00:00.000Z");
    expect(getAgentRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: ctx.projectId,
        environment: ctx.environment,
        identity: { kind: "id", value: agentId },
      }),
    );
  });

  it("does not write during dry-run, to remote URLs, or with a mismatched project key", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ id: "another-project" }] }));
    vi.stubGlobal("fetch", fetcher);
    await seedAgentsMvpLegacyApi({ ...ctx, dryRun: true }, "2026-11-05");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      seedAgentsMvpLegacyApi({ ...ctx, baseUrl: "https://example.com" }),
    ).rejects.toThrow("local app or disposable");
    await expect(seedAgentsMvpLegacyApi(ctx, "2026-11-05")).rejects.toThrow(
      "does not belong",
    );
    expect(fetcher.mock.calls.every(([, init]) => !init.method)).toBe(true);
  });

  it("fails clearly when the deployment refuses non-score legacy events", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [{ id: ctx.projectId }] }))
      .mockResolvedValueOnce(
        Response.json(
          { errors: [{ message: "Only score events accepted" }] },
          { status: 207 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      seedAgentsMvpLegacyApi(ctx, "2026-11-05"),
    ).rejects.toMatchObject({
      message: "The legacy ingestion API rejected fixture events.",
      fix: expect.stringContaining("still accepts non-score legacy JSON"),
    });
    expect(getAgentDetail).not.toHaveBeenCalled();
  });
});
