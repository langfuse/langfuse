import fs from "node:fs";
import path from "node:path";

import {
  getFernDeprecatedOperations,
  getFernDeprecatedProperties,
} from "./fern-deprecations";
import { stampDeprecations } from "./stamp-deprecations";
import { stampUnionVariantTitles } from "./stamp-union-variant-titles";

const webDirectory = process.cwd();
const api = process.argv[2] ?? "server";
if (api !== "server" && api !== "organizations") {
  throw new Error(`Unsupported API: ${api}`);
}
const definitionDirectory = path.resolve(
  webDirectory,
  `../fern/apis/${api}/definition`,
);
const openApiPath = path.resolve(
  webDirectory,
  `public/generated/${api === "server" ? "api" : "organizations-api"}/openapi.yml`,
);

const deprecatedOperations = getFernDeprecatedOperations(definitionDirectory);
const deprecatedProperties = getFernDeprecatedProperties(definitionDirectory);
const openApiSource = fs.readFileSync(openApiPath, "utf8");
const deprecatedSource = stampDeprecations(
  openApiSource,
  deprecatedOperations,
  deprecatedProperties,
);
const { source: syncedSource, stamped } =
  stampUnionVariantTitles(deprecatedSource);

if (syncedSource !== openApiSource) fs.writeFileSync(openApiPath, syncedSource);

console.log(
  `Synced ${deprecatedOperations.length} deprecated OpenAPI operations from Fern definitions.`,
);
console.log(
  `Synced ${deprecatedProperties.length} deprecated OpenAPI properties from Fern definitions.`,
);
console.log(`Titled ${stamped} anonymous OpenAPI union variants for Scalar.`);
