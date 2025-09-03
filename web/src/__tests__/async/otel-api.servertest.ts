import { makeAPICall } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import { getObservationById, getTraceById } from "@langfuse/shared/src/server";
import { randomBytes } from "crypto";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/otel/v1/traces API Endpoint", () => {
  it("should process a json payload correctly", async () => {
    const traceId = randomBytes(16);
    const spanId = randomBytes(8);

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "2.60.3",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: traceId,
                  },
                  spanId: {
                    type: "Buffer",
                    data: spanId,
                  },
                  name: "my-generation",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
              ],
            },
          ],
        },
      ],
    };

    const response = await makeAPICall(
      "POST",
      "/api/public/otel/v1/traces",
      payload,
    );

    expect(response.status).toBe(200);

    await waitForExpect(async () => {
      const trace = await getTraceById({
        projectId,
        traceId: traceId.toString("hex"),
      });
      expect(trace).toBeDefined();
      expect(trace!.id).toBe(traceId.toString("hex"));

      const observation = await getObservationById({
        projectId,
        id: spanId.toString("hex"),
      });
      expect(observation).toBeDefined();
      expect(observation!.id).toBe(spanId.toString("hex"));
      expect(observation!.name).toBe("my-generation");
    }, 25_000);
  }, 30_000);
});
