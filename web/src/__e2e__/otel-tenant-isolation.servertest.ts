import {
  createOrgProjectAndApiKey,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";
import { randomBytes } from "crypto";

describe("OTEL ingestion tenant isolation", () => {
  it(
    "span posted with project A's key lands only in project A's observations",
    async () => {
      const projectA = await createOrgProjectAndApiKey();
      const projectB = await createOrgProjectAndApiKey();

      const traceId = randomBytes(16);
      const spanId = randomBytes(8);
      const spanIdHex = spanId.toString("hex");

      const payload = {
        resourceSpans: [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                scope: {
                  name: "langfuse-sdk",
                  version: "1.0.0",
                  attributes: [],
                },
                spans: [
                  {
                    traceId,
                    spanId,
                    name: "tenant-isolation-test-span",
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

      const response = await fetch(
        "http://localhost:3000/api/public/otel/v1/traces",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: projectA.auth,
          },
          body: JSON.stringify(payload),
        },
      );
      expect(response.status).toBe(200);

      await waitForExpect(
        async () => {
          const rowsA = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM observations WHERE project_id = {projectId: String} AND id = {spanId: String}`,
            params: { projectId: projectA.projectId, spanId: spanIdHex },
          });
          expect(Number(rowsA[0]?.count)).toBe(1);

          const rowsB = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM observations WHERE project_id = {projectId: String} AND id = {spanId: String}`,
            params: { projectId: projectB.projectId, spanId: spanIdHex },
          });
          expect(Number(rowsB[0]?.count)).toBe(0);
        },
        40_000,
        1_000,
      );
    },
    60_000,
  );
});
