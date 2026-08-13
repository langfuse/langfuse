import fs from "node:fs";
import { parse } from "yaml";

const openApiPath = "public/generated/api/openapi.yml";

const deprecatedOperations = [
  ["post", "/api/public/dataset-run-items"],
  ["get", "/api/public/dataset-run-items"],
  ["get", "/api/public/datasets/{datasetName}/runs/{runName}"],
  ["delete", "/api/public/datasets/{datasetName}/runs/{runName}"],
  ["get", "/api/public/datasets/{datasetName}/runs"],
  ["post", "/api/public/ingestion"],
  ["get", "/api/public/metrics"],
  ["get", "/api/public/observations/{observationId}"],
  ["get", "/api/public/observations"],
  ["get", "/api/public/v2/scores"],
  ["get", "/api/public/v2/scores/{scoreId}"],
  ["get", "/api/public/sessions"],
  ["get", "/api/public/sessions/{sessionId}"],
  ["get", "/api/public/traces/{traceId}"],
  ["get", "/api/public/traces"],
] as const;

describe("OpenAPI deprecations", () => {
  it("marks every deprecated Fern endpoint in the OpenAPI schema", () => {
    const openApi = parse(fs.readFileSync(openApiPath, "utf8"), {
      maxAliasCount: -1,
    });

    for (const [method, endpointPath] of deprecatedOperations) {
      expect(openApi.paths[endpointPath][method].deprecated).toBe(true);
    }
  });
});
