import {
  countLegacyApiEntrypoints,
  normalizeLegacyApiEntrypoint,
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
