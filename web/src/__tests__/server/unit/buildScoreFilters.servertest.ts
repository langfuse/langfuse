const { mockHandleGenerateScores, mockHandleGetScoresCount } = vi.hoisted(
  () => ({
    mockHandleGenerateScores: vi.fn(),
    mockHandleGetScoresCount: vi.fn(),
  }),
);

vi.mock("@/src/features/public-api/server/scores", () => ({
  _handleGenerateScoresForPublicApi: mockHandleGenerateScores,
  _handleGetScoresCountForPublicApi: mockHandleGetScoresCount,
  convertScoreToPublicApi: vi.fn((score) => score),
}));

vi.mock("@/src/features/audit-logs/auditLog", () => ({
  auditLog: vi.fn(),
}));

import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { LISTABLE_SCORE_TYPES } from "@langfuse/shared";
import type { ScoreQueryType } from "@langfuse/shared/src/server";

const BASE: ScoreQueryType = {
  projectId: "project-1",
  page: 1,
  limit: 10,
};

describe("buildScoreFilters", () => {
  beforeEach(() => {
    mockHandleGenerateScores.mockResolvedValue([]);
    mockHandleGetScoresCount.mockResolvedValue(0);
    vi.clearAllMocks();
    mockHandleGenerateScores.mockResolvedValue([]);
  });

  it("always injects project_id into scoresFilter", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi(BASE);

    const { scoresFilter } = mockHandleGenerateScores.mock.calls[0][0];
    expect(
      scoresFilter.some(
        (f: any) => f.field === "project_id" && f.value === "project-1",
      ),
    ).toBe(true);
  });

  it("v1 adds data_type restriction to scoresFilter for listable score types", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi(BASE);

    const { scoresFilter } = mockHandleGenerateScores.mock.calls[0][0];
    const dataTypeFilter = scoresFilter.find(
      (f: any) => f.field === "data_type",
    );
    expect(dataTypeFilter).toBeDefined();
    expect(dataTypeFilter.values).toEqual(
      expect.arrayContaining([...LISTABLE_SCORE_TYPES]),
    );
    expect(dataTypeFilter.values).toHaveLength(LISTABLE_SCORE_TYPES.length);
  });

  it("v2 does not add a data_type restriction from scoreDataTypes", async () => {
    await new ScoresApiService("v2").generateScoresForPublicApi(BASE);

    const { scoresFilter } = mockHandleGenerateScores.mock.calls[0][0];
    // With BASE props only project_id should be present (1 filter total)
    expect(scoresFilter.length()).toBe(1);
  });

  it("name filter lands in scoresFilter, not tracesFilter", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      name: "accuracy",
    });

    const { scoresFilter, tracesFilter } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(scoresFilter.some((f: any) => f.field === "name")).toBe(true);
    expect(tracesFilter.some((f: any) => f.field === "name")).toBe(false);
  });

  it("traceId filter lands in scoresFilter, not tracesFilter", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      traceId: "trace-abc",
    });

    const { scoresFilter, tracesFilter } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(scoresFilter.some((f: any) => f.field === "trace_id")).toBe(true);
    expect(tracesFilter.some((f: any) => f.field === "trace_id")).toBe(false);
  });

  it("userId filter lands in tracesFilter, not scoresFilter", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      userId: "user-xyz",
    });

    const { scoresFilter, tracesFilter } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(tracesFilter.some((f: any) => f.field === "user_id")).toBe(true);
    expect(scoresFilter.some((f: any) => f.field === "user_id")).toBe(false);
  });

  it("environment alone does not add to tracesFilter when no other trace filters are set", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      environment: "production",
    });

    const { tracesFilter } = mockHandleGenerateScores.mock.calls[0][0];
    expect(tracesFilter.length()).toBe(0);
  });

  it("environment is added to tracesFilter when userId is also provided", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      userId: "user-xyz",
      environment: "production",
    });

    const { tracesFilter } = mockHandleGenerateScores.mock.calls[0][0];
    expect(tracesFilter.some((f: any) => f.field === "user_id")).toBe(true);
    expect(tracesFilter.some((f: any) => f.field === "environment")).toBe(true);
  });

  it("environment is added to tracesFilter when traceTags is also provided", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      traceTags: ["llm"],
      environment: "staging",
    });

    const { tracesFilter } = mockHandleGenerateScores.mock.calls[0][0];
    expect(tracesFilter.some((f: any) => f.field === "tags")).toBe(true);
    expect(tracesFilter.some((f: any) => f.field === "environment")).toBe(true);
  });
});

describe("determineTraceJoinRequirement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleGenerateScores.mockResolvedValue([]);
  });

  it("no fields param → includeTrace true, needsTraceJoin true", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi(BASE);

    const { includeTrace, needsTraceJoin } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(includeTrace).toBe(true);
    expect(needsTraceJoin).toBe(true);
  });

  it("fields=[score] and no trace filters → includeTrace false, needsTraceJoin false", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      fields: ["score"],
    });

    const { includeTrace, needsTraceJoin } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(includeTrace).toBe(false);
    expect(needsTraceJoin).toBe(false);
  });

  it("fields=[score] with userId → includeTrace false but needsTraceJoin true", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      fields: ["score"],
      userId: "user-xyz",
    });

    const { includeTrace, needsTraceJoin } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(includeTrace).toBe(false);
    expect(needsTraceJoin).toBe(true);
  });

  it("fields=[score, trace] → includeTrace true, needsTraceJoin true", async () => {
    await new ScoresApiService("v1").generateScoresForPublicApi({
      ...BASE,
      fields: ["score", "trace"],
    });

    const { includeTrace, needsTraceJoin } =
      mockHandleGenerateScores.mock.calls[0][0];
    expect(includeTrace).toBe(true);
    expect(needsTraceJoin).toBe(true);
  });
});
