import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

// Product skills that ship in Halo before they are copied to langfuse/skills.
// Drop a file here once the same path exists upstream. Upstream wins.
const INDEX_BULLETS = {
  "references/production-review.md":
    "- daily production review of volumes, scores, and topics: references/production-review.md",
};

const walkMarkdown = (root, directory, files) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(root, path, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    files.push({
      path: relative(root, path).split("\\").join("/"),
      bytes: readFileSync(path),
    });
  }
  return files;
};

export const readExtraFiles = (packageRoot) => {
  const extrasRoot = join(packageRoot, "extras");
  if (!existsSync(extrasRoot)) return new Map();

  const byBundle = new Map();
  for (const entry of readdirSync(extrasRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bundleRoot = join(extrasRoot, entry.name);
    byBundle.set(entry.name, walkMarkdown(bundleRoot, bundleRoot, []));
  }
  return byBundle;
};

export const insertReferenceBullet = (markdown, bullet) => {
  const referencePath = bullet.match(/references\/\S+/)?.[0];
  if (!referencePath || markdown.includes(referencePath)) return markdown;

  const lines = markdown.split("\n");
  const feedbackIndex = lines.findIndex((line) =>
    line.includes("references/skill-feedback.md"),
  );
  const headingIndex = lines.findIndex((line) =>
    line.startsWith("## Use case specific references"),
  );
  const index =
    feedbackIndex >= 0
      ? feedbackIndex
      : headingIndex >= 0
        ? headingIndex + 1
        : -1;
  if (index < 0) return markdown;

  lines.splice(index, 0, bullet);
  return lines.join("\n");
};

export const applyExtraFiles = (bundles, extraFilesByBundle) =>
  bundles.map((bundle) => {
    const extras = extraFilesByBundle.get(bundle.name) ?? [];
    const existing = new Set(bundle.files.map((file) => file.path));
    const additions = extras.filter((file) => !existing.has(file.path));
    if (additions.length === 0) return bundle;

    const files = [...bundle.files, ...additions]
      .map((file) => {
        if (file.path !== "SKILL.md") return file;
        let markdown = file.bytes.toString("utf8");
        for (const addition of additions) {
          const bullet = INDEX_BULLETS[addition.path];
          if (bullet) markdown = insertReferenceBullet(markdown, bullet);
        }
        return { ...file, bytes: Buffer.from(markdown) };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    return { ...bundle, files };
  });
