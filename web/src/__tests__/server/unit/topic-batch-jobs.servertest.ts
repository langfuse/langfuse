import {
  ActionId,
  BatchActionType,
  BatchExportQuerySchema,
  BatchExportTableName,
} from "@langfuse/shared";
import {
  CreateObservationAddToDatasetActionSchema,
  CreateObservationBatchEvaluationActionSchema,
} from "@/src/features/batch-actions/validation";
import { createBatchActionJob } from "@/src/features/table/server/createBatchActionJob";
import { TOPIC_FILTERS_IN_BATCH_JOBS_MESSAGE } from "@langfuse/shared/topics";
import { describe, expect, it } from "vitest";

const message = TOPIC_FILTERS_IN_BATCH_JOBS_MESSAGE;
const filter = [
  {
    type: "categoryOptions" as const,
    column: "topics",
    key: "Intent",
    operator: "any of" as const,
    value: ["Order Exchange Requests"],
  },
];
const query = { filter, orderBy: null };

// Batch jobs re-read the query in the worker, which cannot resolve topic membership yet.
describe("topic filters in batch jobs", () => {
  it("rejects them for exports and query-based actions", () => {
    expect(
      BatchExportQuerySchema.safeParse({
        ...query,
        tableName: BatchExportTableName.Events,
      }).error?.issues[0]?.message,
    ).toBe(message);
    expect(
      CreateObservationAddToDatasetActionSchema.safeParse({
        projectId: "project-a",
        query,
        config: {},
      }).error?.issues.map((issue) => issue.message),
    ).toContain(message);
    expect(
      CreateObservationBatchEvaluationActionSchema.safeParse({
        projectId: "project-a",
        query,
        evaluatorIds: ["evaluator-a"],
      }).error?.issues.map((issue) => issue.message),
    ).toContain(message);
  });

  it("rejects them for select-all actions before creating the job", async () => {
    await expect(
      createBatchActionJob({
        projectId: "project-a",
        actionId: ActionId.TraceDelete,
        tableName: BatchExportTableName.Traces,
        actionType: BatchActionType.Delete,
        session: {
          user: { id: "user-a" },
          orgId: "org-a",
          orgRole: "OWNER",
        },
        query,
      }),
    ).rejects.toThrow(message);
  });
});
