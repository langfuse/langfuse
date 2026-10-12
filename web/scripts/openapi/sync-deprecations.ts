import fs from "node:fs";
import path from "node:path";

import {
  getFernDeprecatedOperations,
  getFernDeprecatedProperties,
} from "./fern-deprecations";
import { stampDeprecations } from "./stamp-deprecations";

const webDirectory = process.cwd();
const definitionDirectory = path.resolve(
  webDirectory,
  "../fern/apis/server/definition",
);
const openApiPath = path.resolve(
  webDirectory,
  "public/generated/api/openapi.yml",
);

const deprecatedOperations = getFernDeprecatedOperations(definitionDirectory);
const deprecatedProperties = getFernDeprecatedProperties(definitionDirectory);
const openApiSource = fs.readFileSync(openApiPath, "utf8");
const syncedSource = stampDeprecations(
  openApiSource,
  deprecatedOperations,
  deprecatedProperties,
);

if (syncedSource !== openApiSource) fs.writeFileSync(openApiPath, syncedSource);

console.log(
  `Synced ${deprecatedOperations.length} deprecated OpenAPI operations and ${deprecatedProperties.length} properties from Fern definitions.`,
);
