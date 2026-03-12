#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const ignoredDirNames = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "generated",
  "node_modules",
]);

const failures = [];

async function walk(dir, visitor) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) {
        continue;
      }

      await walk(path.join(dir, entry.name), visitor);
      continue;
    }

    await visitor(path.join(dir, entry.name));
  }
}

function isAgentSkillFile(relativePath) {
  return (
    relativePath.startsWith(`.agents${path.sep}skills${path.sep}`) ||
    relativePath.includes(`${path.sep}.agents${path.sep}skills${path.sep}`)
  );
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { body: content, frontmatter: null };
  }

  return {
    body: content.slice(match[0].length),
    frontmatter: match[1],
  };
}

function extractFrontmatterField(frontmatter, key) {
  const lines = frontmatter.split("\n");
  const startIndex = lines.findIndex((line) => line.startsWith(`${key}:`));

  if (startIndex === -1) {
    return "";
  }

  const firstLineValue = lines[startIndex].slice(key.length + 1).trim();
  if (firstLineValue) {
    return firstLineValue;
  }

  const multilineValue = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) {
      break;
    }

    if (line.trim() === "") {
      continue;
    }

    if (!/^\s+/.test(line)) {
      break;
    }

    multilineValue.push(line.trim());
  }

  return multilineValue.join(" ").trim();
}

function stripCode(content) {
  return content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
}

function collectMarkdownLinks(content) {
  const links = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  const markdownOnlyContent = stripCode(content);
  let match = regex.exec(markdownOnlyContent);

  while (match) {
    links.push(match[1].trim());
    match = regex.exec(markdownOnlyContent);
  }

  return links;
}

function normalizeLinkTarget(target) {
  return target.replace(/^<|>$/g, "").split("#", 1)[0].split("?", 1)[0];
}

const skillDirs = new Set();
const markdownFiles = [];

await walk(repoRoot, async (filePath) => {
  const relativePath = path.relative(repoRoot, filePath);
  if (!isAgentSkillFile(relativePath) || !relativePath.endsWith(".md")) {
    return;
  }

  markdownFiles.push(filePath);

  if (path.basename(filePath) === "SKILL.md") {
    skillDirs.add(path.dirname(filePath));
  }
});

if (skillDirs.size === 0) {
  failures.push("No skill directories were found under any .agents/skills path.");
}

for (const skillDir of skillDirs) {
  const skillPath = path.join(skillDir, "SKILL.md");
  const relativeSkillPath = path.relative(repoRoot, skillPath);
  const content = await fs.readFile(skillPath, "utf8");
  const { body, frontmatter } = parseFrontmatter(content);

  if (!frontmatter) {
    failures.push(`${relativeSkillPath}: missing YAML frontmatter`);
    continue;
  }

  const name = extractFrontmatterField(frontmatter, "name");
  const description = extractFrontmatterField(frontmatter, "description");

  if (!name) {
    failures.push(`${relativeSkillPath}: missing frontmatter field "name"`);
  }

  if (!description) {
    failures.push(
      `${relativeSkillPath}: missing frontmatter field "description"`,
    );
  }

  if (!body.trim()) {
    failures.push(`${relativeSkillPath}: skill body is empty`);
  }
}

for (const markdownPath of markdownFiles) {
  const relativeMarkdownPath = path.relative(repoRoot, markdownPath);
  const content = await fs.readFile(markdownPath, "utf8");
  const links = collectMarkdownLinks(content);

  for (const rawLink of links) {
    const target = normalizeLinkTarget(rawLink);

    if (
      !target ||
      target.startsWith("#") ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }

    if (target.includes(".claude/skills")) {
      failures.push(
        `${relativeMarkdownPath}: stale link points to legacy Claude skills path (${rawLink})`,
      );
      continue;
    }

    if (path.isAbsolute(target)) {
      failures.push(
        `${relativeMarkdownPath}: link target must be relative to the skill (${rawLink})`,
      );
      continue;
    }

    const resolvedPath = path.resolve(path.dirname(markdownPath), target);

    try {
      await fs.access(resolvedPath);
    } catch {
      failures.push(
        `${relativeMarkdownPath}: linked file does not exist (${rawLink})`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Skill validation failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${skillDirs.size} skill directories and ${markdownFiles.length} markdown files.`,
);
