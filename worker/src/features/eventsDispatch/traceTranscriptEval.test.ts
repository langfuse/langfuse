import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueueName } from "@langfuse/shared/src/server";
import { enqueueTraceTranscriptEvals } from "./traceTranscriptEval";

const codeAdd = vi.hoisted(() => vi.fn());
const judgeAdd = vi.hoisted(() => vi.fn());
const findAssignments = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  isTraceEvalsProjectEnabled: () => true,
  CodeEvalExecutionQueue: { getInstance: () => ({ add: codeAdd }) },
  LLMAsJudgeExecutionQueue: { getInstance: () => ({ add: judgeAdd }) },
}));

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/db")>()),
  prisma: {
    evaluationRuleEvaluatorAssignment: { findMany: findAssignments },
    jobExecution: { upsert: vi.fn(async () => ({})) },
  },
}));

const assignment = (id: string, type: "CODE" | "LLM_AS_JUDGE") => ({
  id,
  evaluatorId: `evaluator-${id}`,
  evaluator: { type },
  evaluationRule: { id: "rule", delay: null },
});

describe("enqueueTraceTranscriptEvals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends code evaluators to the code eval queue and judges to the judge queue", async () => {
    findAssignments.mockResolvedValue([
      assignment("code", "CODE"),
      assignment("judge", "LLM_AS_JUDGE"),
    ]);

    await enqueueTraceTranscriptEvals(
      { projectId: "project", traceId: "trace", revision: "1" },
      ["rule"],
      { transcriptS3Path: "transcript.json" },
    );

    expect(judgeAdd).toHaveBeenCalledTimes(1);
    expect(judgeAdd.mock.calls[0][1].payload.evaluatorId).toBe(
      "evaluator-judge",
    );
    expect(codeAdd).toHaveBeenCalledTimes(1);
    expect(codeAdd.mock.calls[0][0]).toBe(QueueName.CodeEvalExecution);
    expect(codeAdd.mock.calls[0][1].payload).toMatchObject({
      type: "trace-transcript",
      projectId: "project",
      traceId: "trace",
      revision: "1",
      transcriptS3Path: "transcript.json",
      evaluatorId: "evaluator-code",
      evaluationRuleId: "rule",
    });
  });
});
