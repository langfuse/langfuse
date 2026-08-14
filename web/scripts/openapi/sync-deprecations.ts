import fs from "node:fs";
import path from "node:path";
import { isMap, parseDocument } from "yaml";

import { getFernDeprecatedOperations } from "./fern-deprecations";

const webDirectory = process.cwd();
const definitionDirectory = path.resolve(
  webDirectory,
  "../fern/apis/server/definition",
);
const openApiPath = path.resolve(
  webDirectory,
  "public/generated/api/openapi.yml",
);

let openApiSource = fs.readFileSync(openApiPath, "utf8");
const openApi = parseDocument(openApiSource);

if (openApi.errors.length > 0) {
  throw new Error(openApi.errors.map((error) => error.message).join("\n"));
}

const deprecatedOperations = getFernDeprecatedOperations(definitionDirectory);
const insertions: Array<{ offset: number; value: string }> = [];

for (const { method, endpointPath } of deprecatedOperations) {
  const operation = openApi.getIn(["paths", endpointPath, method], true);

  if (!isMap(operation)) {
    throw new Error(
      `OpenAPI schema does not contain ${method.toUpperCase()} ${endpointPath}`,
    );
  }

  const deprecated = operation.get("deprecated");
  if (deprecated === true) continue;
  if (deprecated !== undefined) {
    throw new Error(
      `${method.toUpperCase()} ${endpointPath} has an invalid deprecated value`,
    );
  }
  if (!operation.range) {
    throw new Error(
      `Cannot locate ${method.toUpperCase()} ${endpointPath} in the OpenAPI source`,
    );
  }

  const operationLineStart =
    openApiSource.lastIndexOf("\n", operation.range[0]) + 1;
  const insertionOffset =
    openApiSource.lastIndexOf("\n", operation.range[1] - 1) + 1;
  const indentation = openApiSource.slice(
    operationLineStart,
    operation.range[0],
  );

  insertions.push({
    offset: insertionOffset,
    value: `${indentation}deprecated: true\n`,
  });
}

for (const { offset, value } of insertions.sort(
  (left, right) => right.offset - left.offset,
)) {
  openApiSource = `${openApiSource.slice(0, offset)}${value}${openApiSource.slice(offset)}`;
}

fs.writeFileSync(openApiPath, openApiSource);
console.log(
  `Synced ${deprecatedOperations.length} deprecated OpenAPI operations from Fern definitions.`,
);
