import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvalTemplateType } from "@langfuse/shared/src/db";

const addToLLMQueue = vi.fn();
const addToCodeQueue = vi.fn();
const getLLMQueueInstance = vi.fn(() => ({ add: addToLLMQueue }));
const getCodeQueueInstance = vi.fn(() => ({ add: addToCodeQueue }));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");

  return {
    ...actual,
    LLMAsJudgeExecutionQueue: {
      getInstance: getLLMQueueInstance,
    },
    CodeEvalExecutionQueue: {
      getInstance: getCodeQueueInstance,
    },
  };
});

describe("createObservationEvalSchedulerDeps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes LLM-as-judge observation eval jobs to the LLM queue", async () => {
    const { createObservationEvalSchedulerDeps } =
      await import("../createSchedulerDeps");

    await createObservationEvalSchedulerDeps().enqueueEvalJob({
      projectId: "project-1",
      jobExecutionId: "job-1",
      observationS3Path: "evals/project-1/observations/obs-1.json",
      delay: 10,
      evalTemplateType: EvalTemplateType.LLM_AS_JUDGE,
    });

    expect(getLLMQueueInstance).toHaveBeenCalledWith({
      shardingKey: "project-1-job-1",
    });
    expect(addToLLMQueue).toHaveBeenCalledWith(
      "llm-as-a-judge-execution-queue",
      expect.objectContaining({
        name: "llm-as-a-judge-execution-job",
        id: "job-1",
        payload: expect.objectContaining({ projectId: "project-1" }),
      }),
      { delay: 10 },
    );
    expect(getCodeQueueInstance).not.toHaveBeenCalled();
  });

  it("routes code observation eval jobs to the code eval queue", async () => {
    const { createObservationEvalSchedulerDeps } =
      await import("../createSchedulerDeps");

    await createObservationEvalSchedulerDeps().enqueueEvalJob({
      projectId: "project-1",
      jobExecutionId: "job-2",
      observationS3Path: "evals/project-1/observations/obs-1.json",
      delay: 20,
      evalTemplateType: EvalTemplateType.CODE,
    });

    expect(getCodeQueueInstance).toHaveBeenCalledWith({
      shardingKey: "project-1-job-2",
    });
    expect(addToCodeQueue).toHaveBeenCalledWith(
      "code-eval-execution-queue",
      expect.objectContaining({
        name: "code-eval-execution-job",
        id: "job-2",
        payload: expect.objectContaining({ projectId: "project-1" }),
      }),
      { delay: 20 },
    );
    expect(getLLMQueueInstance).not.toHaveBeenCalled();
  });
});
