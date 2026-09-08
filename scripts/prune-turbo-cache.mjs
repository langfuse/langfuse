import {
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

// CI must clear restored run summaries before its build with --summarize.
const runsDir = ".turbo/runs";
const cacheDir = ".turbo/cache";
const summaries = readdirSync(runsDir).filter((file) => file.endsWith(".json"));
if (summaries.length !== 1) {
  throw new Error("Expected exactly one current Turbo run summary");
}
const summary = JSON.parse(readFileSync(join(runsDir, summaries[0]), "utf8"));
if (
  summary.execution?.exitCode !== 0 ||
  !Array.isArray(summary.tasks) ||
  summary.tasks.length === 0 ||
  summary.tasks.some(
    (task) =>
      typeof task?.hash !== "string" || !/^[a-f0-9]{16}$/.test(task.hash),
  )
) {
  throw new Error("Expected a successful Turbo run with valid task hashes");
}

// Include cache hits and dependency tasks, regardless of artifact age.
const hashes = new Set(summary.tasks.map((task) => task.hash));
let removedBytes = 0;
let removedFiles = 0;
for (const entry of readdirSync(cacheDir, { withFileTypes: true })) {
  const match = entry.name.match(
    /^([a-f0-9]{16})(?:\.tar\.zst|-meta\.json|-manifest\.json)$/,
  );
  if (!entry.isFile() || !match || hashes.has(match[1])) continue;
  const file = join(cacheDir, entry.name);
  removedBytes += statSync(file).size;
  unlinkSync(file);
  removedFiles++;
}
rmSync(runsDir, { recursive: true });
console.log(
  `Turbo cache: retained ${hashes.size} task hashes; removed ${removedFiles} files (${(removedBytes / 1024 ** 2).toFixed(1)} MiB)`,
);
