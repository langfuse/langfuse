import { createHash } from "node:crypto";
import { globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Vitest hashes each module's source, including Markdown loaded by our plugin.
 * Keep external transform inputs in the namespace so a restored cache cannot
 * reuse output from different compilers, aliases, plugins, or environment files.
 * The experiment remains opt-in; test results themselves are never cached.
 *
 * @param {"web" | "worker" | "shared"} packageName
 */
export function ciVitestCache(packageName) {
  if (!process.env.CI || process.env.CI_VITEST_FS_CACHE !== "1") {
    return undefined;
  }

  const root = resolve(import.meta.dirname, "../..");
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      env: Object.fromEntries(
        Object.entries(process.env)
          .filter(
            ([name]) =>
              ["CI", "NODE_ENV", "NODE_OPTIONS", "BABEL_ENV"].includes(name) ||
              name.startsWith("VITE_"),
          )
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    }),
  );

  const files = globSync(
    [
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "package.json",
      ".npmrc",
      ".env*",
      "{web,worker,ee,packages}/**/package.json",
      "{web,worker,ee,packages}/**/tsconfig*.json",
      "{web,worker,ee,packages}/**/vitest.config.*",
      "{web,worker,ee,packages}/**/.env*",
      "packages/config-typescript/*.json",
      "scripts/vitest/*",
      "patches/*",
    ],
    {
      cwd: root,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/.next-check/**",
        "**/storybook-static/**",
        "**/.git/**",
      ],
    },
  ).sort();
  for (const file of files) {
    hash
      .update(file)
      .update("\0")
      .update(readFileSync(join(root, file)))
      .update("\0");
  }

  // Adding or removing a candidate can change extensionless import resolution
  // without changing the importer. Content changes remain per-module cache keys.
  const sourceFiles = globSync(
    "{web,worker,ee,packages}/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,json,md,mdx,css,scss,sass,less,html,wasm}",
    {
      cwd: root,
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/.next-check/**",
        "**/storybook-static/**",
        "**/.git/**",
      ],
    },
  ).sort();
  hash.update(JSON.stringify(sourceFiles));

  return {
    fsModuleCache: true,
    fsModuleCachePath: join(
      root,
      "node_modules/.cache/vitest",
      packageName,
      hash.digest("hex"),
    ),
  };
}
