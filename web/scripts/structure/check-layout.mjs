import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {{domains: {path: string}[], sharedRoots: string[]}} Registry */

/** @param {string} webRoot @param {Registry} registry @returns {string[]} */
export function checkLayout(webRoot, registry) {
  const roots = [
    ...registry.domains.map(({ path }) => path),
    ...registry.sharedRoots,
  ];
  const allowed = new Set([
    "__tests__",
    "__e2e__",
    "server",
    "ee",
    ...roots.map((path) => path.split("/")[1]),
  ]);
  const errors = [];
  for (const entry of readdirSync(resolve(webRoot, "src"), {
    withFileTypes: true,
  })) {
    if (entry.isDirectory() && !allowed.has(entry.name)) {
      errors.push(
        `rule-declared-source-groups: src/${entry.name} needs an owning domain or shared-root entry in source-structure.json`,
      );
    }
  }
  for (const root of registry.domains.map(({ path }) => path)) {
    if (!existsSync(resolve(webRoot, root)))
      errors.push(`rule-declared-capabilities-exist: missing ${root}`);
  }
  for (const legacy of [
    "src/features",
    "src/ee/features",
    "src/pages",
    "src/instrumentation.ts",
  ]) {
    if (existsSync(resolve(webRoot, legacy)))
      errors.push(`rule-framework-and-domain-layout: legacy entry ${legacy}`);
  }
  for (const entry of ["app", "pages", "instrumentation.ts"]) {
    if (!existsSync(resolve(webRoot, entry)))
      errors.push(`rule-framework-and-domain-layout: missing ${entry}`);
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const registry = JSON.parse(
    readFileSync(resolve(root, "source-structure.json"), "utf8"),
  );
  const errors = checkLayout(root, registry);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `Source layout: ${registry.domains.length} declared capabilities, no legacy feature wrappers`,
    );
}
