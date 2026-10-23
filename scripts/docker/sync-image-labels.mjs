#!/usr/bin/env node
/**
 * Writes the OCI/Red Hat LABEL block of each runtime Dockerfile from
 * image-labels.json. Dockerfiles cannot include other files, and labels passed
 * on the build command line would be missing from plain `docker build`s, so
 * the block is generated into each Dockerfile between BEGIN/END markers.
 *
 *   node scripts/docker/sync-image-labels.mjs          rewrite the Dockerfiles
 *   node scripts/docker/sync-image-labels.mjs --check  exit 1 if any is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const BEGIN = "# BEGIN generated image labels";
const END = "# END generated image labels";

const quote = (value) => `"${value.replace(/[\\"]/g, "\\$&")}"`;

function renderLabelBlock(image, shared) {
  const labels = {
    name: image.name,
    summary: image.summary,
    description: image.description,
    "io.k8s.display-name": image.displayName,
    "io.k8s.description": image.description,
    "org.opencontainers.image.description": image.description,
    "org.opencontainers.image.title": image.title,
    "org.opencontainers.image.licenses": image.licenses,
    ...shared,
  };
  const lines = Object.entries(labels).map(
    ([key, value]) => `${key}=${quote(value)}`,
  );
  return [
    `${BEGIN} from scripts/docker/image-labels.json;`,
    "# edit that file and run `pnpm run docker:labels`.",
    "# Identify the image as Langfuse, not its UBI base. Inherited labels cannot be",
    "# removed, so the Red Hat and Iron Bank ones that would describe this image as",
    "# theirs are set empty; com.redhat.license_terms stays as the EULA pointer.",
    "# Release builds override the title, description, licenses, version, revision",
    "# and created labels.",
    `LABEL ${lines.join(" \\\n    ")}`,
    END,
  ].join("\n");
}

function syncDockerfile(content, block, file) {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${file}: missing "${BEGIN}" / "${END}" markers`);
  }
  return content.slice(0, start) + block + content.slice(end + END.length);
}

function main() {
  const check = process.argv.includes("--check");
  const { shared, images } = JSON.parse(
    readFileSync(resolve(here, "image-labels.json"), "utf8"),
  );
  const stale = [];
  for (const [file, image] of Object.entries(images)) {
    const path = resolve(root, file);
    const current = readFileSync(path, "utf8");
    const next = syncDockerfile(current, renderLabelBlock(image, shared), file);
    if (next === current) continue;
    stale.push(file);
    if (!check) writeFileSync(path, next);
  }
  if (check && stale.length > 0) {
    console.error(
      `Image labels are stale in: ${stale.join(", ")}\n` +
        "Run `pnpm run docker:labels` and commit the result.",
    );
    process.exit(1);
  }
  if (!check && stale.length > 0) console.log(`Updated ${stale.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
