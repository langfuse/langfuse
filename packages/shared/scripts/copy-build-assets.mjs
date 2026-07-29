import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assets = [
  "src/in-app-agent/server/skills/evaluator-design.md",
];

for (const asset of assets) {
  const source = resolve(packageRoot, asset);
  const target = resolve(packageRoot, "dist", asset);

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
