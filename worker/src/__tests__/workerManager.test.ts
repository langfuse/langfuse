import { describe, expect, it } from "vitest";

import { QueueName } from "@langfuse/shared/src/server";
import { WorkerManager } from "../queues/workerManager";

const extractProjectId = (data: unknown): string | undefined =>
  (
    WorkerManager as unknown as {
      extractProjectId(job: { data: unknown }): string | undefined;
    }
  ).extractProjectId({ data });

const resolveMetricInfo = (queueName: QueueName) =>
  (
    WorkerManager as unknown as {
      resolveMetricInfo(queueName: QueueName): {
        clickHouseRoute: string;
      };
    }
  ).resolveMetricInfo(queueName);

describe("WorkerManager", () => {
  describe("extractProjectId", () => {
    it("extracts project ids from queue payloads", () => {
      expect(
        extractProjectId({
          payload: { projectId: "project-from-payload" },
        }),
      ).toBe("project-from-payload");
    });

    it("extracts ingestion project ids from payload auth scope", () => {
      expect(
        extractProjectId({
          payload: {
            authCheck: {
              scope: { projectId: "project-from-auth-scope" },
            },
          },
        }),
      ).toBe("project-from-auth-scope");
    });

    it("ignores non-contract top-level project ids", () => {
      expect(
        extractProjectId({
          projectId: "top-level-project",
        }),
      ).toBeUndefined();
    });

    it("ignores non-contract top-level auth scope project ids", () => {
      expect(
        extractProjectId({
          authCheck: {
            scope: { projectId: "top-level-auth-project" },
          },
        }),
      ).toBeUndefined();
    });
  });

  describe("resolveMetricInfo", () => {
    it("uses the queue name as the worker ClickHouse route", () => {
      expect(resolveMetricInfo(QueueName.TraceDelete).clickHouseRoute).toBe(
        QueueName.TraceDelete,
      );
    });

    it("uses the base queue name as the worker ClickHouse route for sharded queues", () => {
      expect(
        resolveMetricInfo(`${QueueName.IngestionQueue}-1` as QueueName)
          .clickHouseRoute,
      ).toBe(QueueName.IngestionQueue);
    });
  });
});
