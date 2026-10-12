import { mkdir } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";
import Piscina from "piscina";

const distDir = process.env.NEXT_DIST_DIR || ".next";
const outfile = path.resolve(
  distDir,
  "standalone",
  "web",
  "otelIngestionWorker.js",
);

await mkdir(path.dirname(outfile), { recursive: true });

await build({
  absWorkingDir: process.cwd(),
  entryPoints: ["src/server/otel/otelIngestionWorker.ts"],
  outfile,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node24",
  tsconfig: "tsconfig.json",
  footer: { js: "module.exports = module.exports.default;" },
  sourcemap: false,
});

const pool = new Piscina({
  filename: outfile,
  minThreads: 1,
  maxThreads: 1,
  maxQueue: 0,
  atomics: "disabled",
});

try {
  const warmup = await pool.run({ type: "warmup" });
  if (warmup?.kind !== "warmup") {
    throw new Error(
      `Unexpected OTel worker warm-up result: ${JSON.stringify(warmup)}`,
    );
  }

  const startedAt = performance.now();
  const shadow = await pool.run({ type: "shadow", durationMs: 20 });
  if (shadow?.kind !== "shadow") {
    throw new Error(
      `Unexpected OTel worker shadow result: ${JSON.stringify(shadow)}`,
    );
  }
  if (performance.now() - startedAt < 15) {
    throw new Error("OTel worker shadow task returned without sleeping");
  }
} finally {
  await pool.destroy();
}

console.log(`OTel ingestion worker built and smoke tested: ${outfile}`);
