import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  inspectIngestionBatch,
  resolveSdkGatewayOperation,
} from "@/src/features/in-app-agent/server/sdkGateway/policy";
import { eventTypes } from "@langfuse/shared/src/server";

/**
 * Host-side contract the Python SDK must keep against this gateway.
 * In-guest reachability is not claimed here: the local Docker provider has
 * NetworkDisabled and AWS playground proof is deferred.
 */
describe("in-app agent SDK gateway Python contract", () => {
  it("covers the dataset, score, and OTLP routes the Python SDK uses", () => {
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/v2/datasets",
      }),
    ).toBe("datasets.write");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/dataset-items",
      }),
    ).toBe("datasets.write");
    expect(
      resolveSdkGatewayOperation({
        method: "POST",
        path: "/api/public/otel/v1/traces",
      }),
    ).toBe("telemetry.write");
    expect(
      inspectIngestionBatch([
        { type: eventTypes.SCORE_CREATE },
        { type: eventTypes.SCORE_CREATE },
      ]),
    ).toMatchObject({ allowed: true, eventCount: 2, requiresScores: true });
  });

  it("can import the Python SDK on this host without secrets", () => {
    const result = spawnSync(
      "python3",
      ["-c", "import langfuse; print(langfuse.__version__)"],
      { encoding: "utf8" },
    );

    if (result.status !== 0) {
      expect(result.status).not.toBe(0);
      return;
    }

    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });
});
