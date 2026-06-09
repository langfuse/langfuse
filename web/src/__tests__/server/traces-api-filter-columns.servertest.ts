import {
  createOrgProjectAndApiKey,
  makeZodVerifiedAPICall,
  GetTracesV1Response,
  env,
} from "./traces-api.fixtures";

describe("/api/public/traces API Endpoint", () => {
  let auth: string;

  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey();
    auth = fixture.auth;
  });

  describe("Filter Columns - Doesn't Fail Tests", () => {
    const filters = [
      // Aggregated Metrics (from observations)
      { column: "latency", type: "number", operator: ">=", value: 0 },
      { column: "inputTokens", type: "number", operator: ">=", value: 0 },
      { column: "outputTokens", type: "number", operator: ">=", value: 0 },
      { column: "totalTokens", type: "number", operator: ">=", value: 0 },
      { column: "inputCost", type: "number", operator: ">=", value: 0 },
      { column: "outputCost", type: "number", operator: ">=", value: 0 },
      { column: "totalCost", type: "number", operator: ">=", value: 0 },
      // Observation Level Aggregations
      { column: "level", type: "string", operator: "=", value: "ERROR" },
      { column: "warningCount", type: "number", operator: ">=", value: 0 },
      { column: "errorCount", type: "number", operator: ">=", value: 0 },
      { column: "defaultCount", type: "number", operator: ">=", value: 0 },
      { column: "debugCount", type: "number", operator: ">=", value: 0 },
      // Scores (should not crash, filters are ignored per our fix)
      {
        column: "scores_avg",
        type: "numberObject",
        key: "quality",
        operator: ">=",
        value: 0.5,
      },
      {
        column: "score_categories",
        type: "stringOptions",
        operator: "any of",
        value: ["good", "bad"],
      },
    ];

    const runFilterTests = (useEventsTable: boolean) => {
      const suiteName = useEventsTable
        ? "with events table"
        : "with traces table";
      const queryParam = useEventsTable ? "?useEventsTable=true&" : "?";

      it(`${suiteName}: should not fail for documented filter columns`, async () => {
        const responses = await Promise.all(
          filters.map((filterDef) => {
            const filterParam = JSON.stringify([filterDef]);
            return makeZodVerifiedAPICall(
              GetTracesV1Response,
              "GET",
              `/api/public/traces${queryParam}filter=${encodeURIComponent(filterParam)}`,
              undefined,
              auth,
            );
          }),
        );

        responses.forEach((response) => {
          expect(response.status).toBe(200);
          expect(response.body.data).toBeDefined();
          expect(response.body.meta).toBeDefined();
        });
      });
    };

    // Run for both table implementations
    runFilterTests(false);
    if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true") {
      runFilterTests(true);
    }
  });
});
