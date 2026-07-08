import {
  countLegacyApiEntrypoints,
  getV4ProjectRequiredActionCount,
  normalizeLegacyApiEntrypoint,
  splitV4ProjectsByRequiredChanges,
} from "./utils";

describe("normalizeLegacyApiEntrypoint", () => {
  it("removes the legacy public API prefix", () => {
    expect(
      normalizeLegacyApiEntrypoint("publicapi: GET /api/public/traces"),
    ).toBe("GET /api/public/traces");
  });

  it("keeps unprefixed entrypoints unchanged", () => {
    expect(normalizeLegacyApiEntrypoint("GET /api/public/traces")).toBe(
      "GET /api/public/traces",
    );
  });
});

describe("countLegacyApiEntrypoints", () => {
  it("counts prefixed and unprefixed forms of the same endpoint once", () => {
    expect(
      countLegacyApiEntrypoints([
        { entrypoint: "publicapi: GET /api/public/traces" },
        { entrypoint: "GET /api/public/traces" },
        { entrypoint: "publicapi: POST /api/public/scores" },
      ]),
    ).toBe(2);
  });
});

describe("getV4ProjectRequiredActionCount", () => {
  it("counts all customer-required v4 migration action categories", () => {
    expect(
      getV4ProjectRequiredActionCount({
        traceLevelEvalCount: 2,
        legacyIntegrationCount: 1,
        legacyApiEntrypointCount: 3,
        outdatedSdkUsageSeriesCount: 4,
      }),
    ).toBe(10);
  });
});

describe("splitV4ProjectsByRequiredChanges", () => {
  it("keeps required-change projects separate from migrated projects", () => {
    expect(
      splitV4ProjectsByRequiredChanges([
        { projectId: "needs-work", requiredActionCount: 2 },
        { projectId: "ready", requiredActionCount: 0 },
      ]),
    ).toEqual({
      projectsWithRequiredChanges: [
        { projectId: "needs-work", requiredActionCount: 2 },
      ],
      projectsWithoutRequiredChanges: [
        { projectId: "ready", requiredActionCount: 0 },
      ],
    });
  });
});
