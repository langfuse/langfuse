import fs from "node:fs";
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
});
