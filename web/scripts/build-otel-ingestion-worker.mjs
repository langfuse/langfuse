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
  external: ["@prisma/*"],
  footer: { js: "module.exports = module.exports.default;" },
  sourcemap: false,
});

const pool = new Piscina({
  filename: outfile,
  minThreads: 1,
  maxThreads: 1,
  maxQueue: 1,
  atomics: "disabled",
});

try {
  const body = Buffer.allocUnsafeSlow(2);
  body.write("{}", "utf8");
  const result = await pool.run(
    {
      body,
      contentType: "application/json",
      encodedBodyBytes: body.byteLength,
      config: {
        projectId: "worker-smoke-test",
        publicKey: "worker-smoke-test",
        sdkName: "worker-smoke-test",
        sdkVersion: "1",
      },
    },
    { transferList: [body.buffer] },
  );

  if (result?.kind !== "ok") {
    throw new Error(`Unexpected OTel worker result: ${JSON.stringify(result)}`);
  }
  if (body.buffer.byteLength !== 0) {
    throw new Error("OTel worker smoke body was cloned instead of transferred");
  }
} finally {
  await pool.destroy();
}

console.log(`OTel ingestion worker built and smoke tested: ${outfile}`);
