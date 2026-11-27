import fs from "node:fs";
import path from "node:path";

import {
  getFernDeprecatedOperations,
  getFernDeprecatedProperties,
} from "./fern-deprecations";
import { stampDeprecations } from "./stamp-deprecations";
import { stampInfoAndServers } from "./stamp-info-and-servers";
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

// Only the major version: release-it bumps web/package.json without
// re-exporting the spec, so a full version would go stale on every release.
function readServerMajorVersion(): string {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(webDirectory, "package.json"), "utf8"),
  ) as { version: string };
  return packageJson.version.split(".")[0];
}

const deprecatedOperations = getFernDeprecatedOperations(definitionDirectory);
const deprecatedProperties = getFernDeprecatedProperties(definitionDirectory);
const openApiSource = fs.readFileSync(openApiPath, "utf8");
const deprecatedSource = stampDeprecations(
  openApiSource,
  deprecatedOperations,
  deprecatedProperties,
);
const { source: titledSource, stamped } =
  stampUnionVariantTitles(deprecatedSource);
// The Langfuse API spec gets a title, the major server version and the Cloud regions.
// The organizations API is self-hosted only and keeps its own title.
const syncedSource =
  api === "server"
    ? stampInfoAndServers(titledSource, readServerMajorVersion())
    : titledSource;

if (syncedSource !== openApiSource) fs.writeFileSync(openApiPath, syncedSource);

console.log(
  `Synced ${deprecatedOperations.length} deprecated OpenAPI operations from Fern definitions.`,
);
console.log(
  `Synced ${deprecatedProperties.length} deprecated OpenAPI properties from Fern definitions.`,
);
console.log(`Titled ${stamped} anonymous OpenAPI union variants for Scalar.`);
