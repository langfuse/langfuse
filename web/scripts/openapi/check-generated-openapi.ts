import fs from "node:fs";
import path from "node:path";

import YAML from "yaml";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "deprecated")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)]),
  );
}

async function main() {
  const [checkedInArg, generatedArg] = process.argv.slice(2);
  if (!checkedInArg || !generatedArg) {
    throw new Error(
      "Usage: check-generated-openapi.ts <checked-in.yml> <fresh-export.yml>",
    );
  }

  const checkedInPath = path.resolve(process.cwd(), checkedInArg);
  const generatedPath = path.resolve(process.cwd(), generatedArg);
  const checkedIn = normalize(
    YAML.parse(fs.readFileSync(checkedInPath, "utf8"), { maxAliasCount: -1 }),
  );
  const generated = normalize(
    YAML.parse(fs.readFileSync(generatedPath, "utf8"), { maxAliasCount: -1 }),
  );

  if (JSON.stringify(checkedIn) !== JSON.stringify(generated)) {
    throw new Error(
      `Checked-in OpenAPI spec ${checkedInArg} does not match a fresh Fern export`,
    );
  }

  console.log("Checked-in OpenAPI spec matches a fresh Fern export");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
