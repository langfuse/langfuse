// Loads web/src/features/public-api/server/deprecations.ts at a git ref, so the
// mock serves the exact notice text, headers and body stamping of that ref.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEPRECATIONS_PATH = "web/src/features/public-api/server/deprecations.ts";

export async function loadDeprecations(ref, repoRoot) {
  const source = execFileSync("git", ["show", `${ref}:${DEPRECATIONS_PATH}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  // The module's only imports are types; drop them so Node's type stripping
  // can run it without resolving `next` or `@langfuse/shared`.
  const importLines = source.match(/^import .*;$/gm) ?? [];
  for (const line of importLines) {
    if (!/^import \{ type [\w, ]+\} from "[^"]+";$/.test(line)) {
      throw new Error(`Unexpected non-type import in ${DEPRECATIONS_PATH}@${ref}: ${line}`);
    }
  }
  const stripped = source.replace(/^import .*;$/gm, "");
  const dir = mkdtempSync(join(tmpdir(), "lf-deprecations-"));
  const file = join(dir, "deprecations.ts");
  writeFileSync(file, stripped);
  return import(pathToFileURL(file).href);
}
