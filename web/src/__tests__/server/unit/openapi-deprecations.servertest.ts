import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

import { getFernDeprecatedOperations } from "../../../../scripts/openapi/fern-deprecations";

type OpenApiDocument = {
  paths: Record<string, Record<string, { deprecated?: boolean }>>;
};

const definitionDirectory = path.resolve(
  process.cwd(),
  "../fern/apis/server/definition",
);
const openApiPath = path.resolve(
  process.cwd(),
  "public/generated/api/openapi.yml",
);

describe("OpenAPI deprecations", () => {
  it("matches the deprecated endpoints in the Fern definitions", () => {
    const openApi = parse(fs.readFileSync(openApiPath, "utf8"), {
      maxAliasCount: -1,
    }) as OpenApiDocument;
    const openApiDeprecatedOperations = Object.entries(openApi.paths).flatMap(
      ([endpointPath, pathItem]) =>
        Object.entries(pathItem).flatMap(([method, operation]) =>
          operation.deprecated ? [`${method} ${endpointPath}`] : [],
        ),
    );

    expect(openApiDeprecatedOperations.sort()).toEqual(
      getFernDeprecatedOperations(definitionDirectory)
        .map(({ method, endpointPath }) => `${method} ${endpointPath}`)
        .sort(),
    );
  });

  it("supports deprecated endpoints at a service base path", () => {
    const fixtureDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "fern-deprecations-"),
    );

    try {
      fs.writeFileSync(
        path.join(fixtureDirectory, "api.yml"),
        "base-path: /api\n",
      );
      fs.writeFileSync(
        path.join(fixtureDirectory, "service.yml"),
        [
          "service:",
          "  base-path: /public",
          "  endpoints:",
          "    get:",
          "      availability: deprecated",
          "      method: GET",
          '      path: ""',
          "",
        ].join("\n"),
      );

      expect(getFernDeprecatedOperations(fixtureDirectory)).toEqual([
        { method: "get", endpointPath: "/api/public" },
      ]);
    } finally {
      fs.rmSync(fixtureDirectory, { recursive: true });
    }
  });
});
