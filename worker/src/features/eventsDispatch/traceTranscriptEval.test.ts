import { describe, expect, it } from "vitest";
import { EvalTemplateType } from "@langfuse/shared";
import { createW3CTraceId, QueueName } from "@langfuse/shared/src/server";
import {
  buildTraceTranscriptEvalJob,
  extractTranscriptEvalVariables,
  traceTranscriptEvalExecutionId,
} from "./traceTranscriptEval";

describe("trace transcript eval jobs", () => {
  it("schedules judge, decision-model, and code jobs against the stored transcript", () => {
    const projectId = "project";
    const ruleId = "rule";
    const assignmentId = "assignment";
    const traceId = "trace";
    const revision = "revision";
    const transcriptS3Path =
      "events/trace-batch/trace/abc/project/trace/revision.json";
    const threads = [{ id: "thread-1", turns: [] }];
    const executionId = traceTranscriptEvalExecutionId({
      projectId,
      ruleId,
      assignmentId,
      traceId,
      revision,
    });

    expect(executionId).toBe(
      createW3CTraceId(
        JSON.stringify([
          "trace-transcript-eval",
          projectId,
          ruleId,
          assignmentId,
          traceId,
          revision,
        ]),
      ),
    );

    const shared = {
      projectId,
      ruleId,
      assignmentId,
      evaluatorId: "evaluator",
      traceId,
      revision,
      transcriptS3Path,
      delay: 12_000,
    };
    const payload = {
      projectId,
      jobExecutionId: executionId,
      traceId,
      revision,
      transcriptS3Path,
      evaluatorId: "evaluator",
      evaluationRuleId: ruleId,
    };

    for (const evaluatorType of [
      EvalTemplateType.LLM_AS_JUDGE,
      EvalTemplateType.DECISION_MODEL,
    ]) {
      const job = buildTraceTranscriptEvalJob({ ...shared, evaluatorType });
      expect(job.queueName).toBe(QueueName.LLMAsJudgeExecution);
      expect(job.queueName).not.toBe(QueueName.EvaluationExecution);
      expect(job.jobId).toBe(executionId);
      expect(job.delay).toBe(12_000);
      expect(job.shardingKey).toBe(`${projectId}-${executionId}`);
      expect(job.payload).toEqual(payload);
    }

    const codeJob = buildTraceTranscriptEvalJob({
      ...shared,
      evaluatorType: EvalTemplateType.CODE,
    });
    expect(codeJob.queueName).toBe(QueueName.CodeEvalExecution);
    expect(codeJob.queueName).not.toBe(QueueName.EvaluationExecution);
    expect(codeJob.jobId).toBe(executionId);
    expect(codeJob.delay).toBe(12_000);
    expect(codeJob.payload).toEqual(payload);
    expect(codeJob.payload).not.toHaveProperty("observationS3Path");
    expect(codeJob.payload).not.toHaveProperty("variableMapping");

    expect(
      extractTranscriptEvalVariables(threads, [
        {
          templateVariable: "conversation",
          selectedColumnId: "threads",
          jsonSelector: null,
        },
      ]),
    ).toEqual({
      ok: true,
      variables: [{ var: "conversation", value: threads }],
    });
    expect(
      extractTranscriptEvalVariables(threads, [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
      ]).ok,
    ).toBe(false);
    expect(extractTranscriptEvalVariables(threads, []).ok).toBe(false);
  });
});
