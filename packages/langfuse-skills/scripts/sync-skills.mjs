#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { format as formatWithPrettier } from "prettier";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const generatedPath = resolve(packageRoot, "src/generated/skills.js");
const sourceRef = process.env.LANGFUSE_SKILLS_REF ?? "main";
const isCheckMode = process.argv.includes("--check");

const getGitHubHeaders = () => ({
  Accept: "application/vnd.github+json",
  Authorization: process.env.GITHUB_TOKEN
    ? `Bearer ${process.env.GITHUB_TOKEN}`
    : undefined,
  "User-Agent": "langfuse-sync-skills",
});

const fetchResponse = async (url) => {
  const response = await fetch(url, { headers: getGitHubHeaders() });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }

  return response;
};

const fetchTree = async () => {
  const response = await fetchResponse(
    `https://api.github.com/repos/langfuse/skills/git/trees/${encodeURIComponent(sourceRef)}?recursive=1`,
  );
  const tree = await response.json();
  if (tree.truncated) throw new Error("Incomplete upstream tree");
  return tree;
};

const findSkillRoots = (tree) => {
  const roots = tree.tree
    .filter((entry) => /^skills\/[^/]+\/SKILL\.md$/.test(entry.path))
    .map((entry) => entry.path.slice(0, -9))
    .sort();
  if (roots.length === 0) throw new Error("No upstream skills found");
  return roots;
};

const downloadFile = async (sha, root, entry) => {
  const response = await fetchResponse(
    `https://raw.githubusercontent.com/langfuse/skills/${sha}/${entry.path}`,
  );
  return {
    path: entry.path.slice(root.length + 1),
    bytes: Buffer.from(await response.arrayBuffer()),
  };
};

const downloadBundle = async (tree, root) => {
  const entries = tree.tree
    .filter(
      (entry) => entry.type === "blob" && entry.path.startsWith(root + "/"),
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const files = await Promise.all(
    entries.map((entry) => downloadFile(tree.sha, root, entry)),
  );
  return { name: root.split("/").at(-1), files };
};

const getExpectedSkills = async () => {
  const tree = await fetchTree();
  const roots = findSkillRoots(tree);
  const bundles = await Promise.all(
    roots.map((root) => downloadBundle(tree, root)),
  );
  return { source: `langfuse/skills@${tree.sha}`, bundles };
};

const parseFrontmatter = (markdown, path) => {
  const yaml = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1];
  if (yaml === undefined) throw new Error(`Missing frontmatter: ${path}`);
  const document = parseDocument(yaml);
  if (document.errors.length > 0)
    throw new Error(`Invalid frontmatter: ${path}`);
  return document.toJS({ maxAliasCount: 0 });
};

const toResourceEntry = (root, { path, bytes }) => ({
  path,
  uri: `${root}/${path.split("/").map(encodeURIComponent).join("/")}`,
  digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  size: bytes.length,
  mimeType: path.endsWith(".md") ? "text/markdown" : "text/plain",
  text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    bytes,
  ),
});

const toSkillEntry = (bundle) => {
  const root = `skill://langfuse/${bundle.name}`;
  const frontmatter = parseFrontmatter(
    bundle.files
      .find((file) => file.path === "SKILL.md")
      .bytes.toString("utf8"),
    `${bundle.name}/SKILL.md`,
  );
  if (
    frontmatter?.name !== bundle.name ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bundle.name) ||
    bundle.name.length > 64 ||
    typeof frontmatter.description !== "string"
  ) {
    throw new Error(`Invalid skill metadata: ${bundle.name}`);
  }
  return {
    uri: `${root}/SKILL.md`,
    frontmatter,
    resources: bundle.files.map((file) => toResourceEntry(root, file)),
  };
};

export const renderSkillsModule = async ({ source, bundles }) => {
  const skills = bundles.map(toSkillEntry);
  const langfuse = skills.find(
    (skill) => skill.frontmatter.name === "langfuse",
  );
  if (!langfuse) throw new Error("Missing Langfuse skill for Halo");
  const resources = langfuse.resources.filter(
    ({ path }) => path !== "SKILL.md",
  );
  const tableOfContents = resources
    .filter(
      ({ path }) => path.startsWith("references/") && path.endsWith(".md"),
    )
    .map(({ path, text }) => {
      const { name, description } = parseFrontmatter(text, path) ?? {};
      if (typeof name !== "string" || typeof description !== "string")
        throw new Error(`Missing reference name or description: ${path}`);
      const cells = [name, description, `[${path}](${path})`].map((value) =>
        value.replace(/\s+/g, " ").replace(/[\\|]/g, "\\$&").trim(),
      );
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
  const entrypoint = readFileSync(
    resolve(packageRoot, "halo/langfuse/SKILL.md"),
    "utf8",
  ).trimEnd();
  const haloSkill = toSkillEntry({
    name: "langfuse",
    files: [
      {
        path: "SKILL.md",
        bytes: Buffer.from(
          `${entrypoint}\n\n## References\n\n| Name | Description | Path |\n| --- | --- | --- |\n${tableOfContents}\n`,
        ),
      },
    ],
  });
  return formatWithPrettier(
    `// This file is generated by packages/langfuse-skills/scripts/sync-skills.mjs.
// Do not edit it manually.
// Source: ${source}

exports.LANGFUSE_SKILLS = ${JSON.stringify(skills)};

// Halo entrypoint: packages/langfuse-skills/halo/langfuse/SKILL.md
exports.LANGFUSE_HALO_SKILLS = exports.LANGFUSE_SKILLS
  .filter((skill) => skill.frontmatter.name === "langfuse")
  .map((skill) => ({
    ...skill,
    frontmatter: ${JSON.stringify(haloSkill.frontmatter)},
    resources: skill.resources
      .filter((resource) => resource.path !== "SKILL.md")
      .concat(${JSON.stringify(haloSkill.resources)}),
  }));
`,
    { parser: "babel" },
  );
};

const main = async () => {
  const expectedSkills = await getExpectedSkills();
  const expectedModule = await renderSkillsModule(expectedSkills);

  if (isCheckMode) {
    try {
      if (readFileSync(generatedPath, "utf8") !== expectedModule) {
        throw new Error("Generated skill catalog differs from upstream");
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("Generated skill catalog is missing");
      }
      throw error;
    }

    console.log("Generated skill catalog is in sync.");
    return;
  }

  mkdirSync(resolve(packageRoot, "src/generated"), { recursive: true });
  writeFileSync(generatedPath, expectedModule);
  console.log("Synced skill catalog.");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
