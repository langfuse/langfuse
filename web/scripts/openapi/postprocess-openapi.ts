import fs from "node:fs";
import path from "node:path";

import { getFernDeprecatedOperations } from "./fern-deprecations";
import { stampDeprecations } from "./stamp-deprecations";
import { stampUnionVariantTitles } from "./stamp-union-variant-titles";

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
const openApiSource = fs.readFileSync(openApiPath, "utf8");
const deprecatedSource = stampDeprecations(openApiSource, deprecatedOperations);
const { source: syncedSource, stamped } =
  stampUnionVariantTitles(deprecatedSource);

if (syncedSource !== openApiSource) fs.writeFileSync(openApiPath, syncedSource);

console.log(
  `Synced ${deprecatedOperations.length} deprecated OpenAPI operations from Fern definitions.`,
);
console.log(`Titled ${stamped} anonymous OpenAPI union variants for Scalar.`);
