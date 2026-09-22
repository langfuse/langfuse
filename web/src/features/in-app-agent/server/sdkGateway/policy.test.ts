import { describe, expect, it } from "vitest";
import { eventTypes } from "@langfuse/shared/src/server";

import {
  authorizeSdkGatewayOperation,
  containsForeignProjectId,
  inspectIngestionBatch,
  resolveSdkGatewayOperation,
} from "./policy";

describe("sdk gateway policy", () => {
  it("maps the approved SDK and model routes", () => {
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/v2/datasets",
      }),
    ).toBe("datasets.write");
    expect(
      resolveSdkGatewayOperation({
        method: "GET",
        path: "/api/public/v2/datasets/demo",
      }),
    ).toBe("datasets.read");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/dataset-items",
      }),
    ).toBe("datasets.write");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/dataset-run-items",
      }),
    ).toBe("datasetRunItems.write");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/otel/v1/traces",
      }),
    ).toBe("telemetry.write");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/ingestion",
      }),
    ).toBe("telemetry.write");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/models/complete",
      }),
    ).toBe("models.complete");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/traces",
      }),
    ).toBeUndefined();
  });

  it("denies a viewer for write operations", () => {
    expect(
      authorizeSdkGatewayOperation({
        operation: "datasets.write",
        projectRole: "VIEWER",
        isAdmin: false,
      }),
    ).toBe(false);
    expect(
      authorizeSdkGatewayOperation({
        operation: "datasets.read",
        projectRole: "VIEWER",
        isAdmin: false,
      }),
    ).toBe(true);
  });

  it("allows score-create batches and rejects mixed forbidden events", () => {
    expect(inspectIngestionBatch([{ type: eventTypes.SCORE_CREATE }])).toEqual({
      allowed: true,
      eventCount: 1,
      requiresScores: true,
      requiresTelemetry: false,
    });

    expect(
      inspectIngestionBatch([
        { type: eventTypes.SCORE_CREATE },
        { type: eventTypes.TRACE_CREATE },
      ]),
    ).toMatchObject({ allowed: false, eventCount: 2 });
  });

  it("denies a foreign project id anywhere in the payload", () => {
    expect(
      containsForeignProjectId(
        { body: { projectId: "other-project" } },
        "project-1",
      ),
    ).toBe(true);
    expect(
      containsForeignProjectId(
        { batch: [{ body: { projectId: "project-1" } }] },
        "project-1",
      ),
    ).toBe(false);
  });
});
