#!/usr/bin/env node

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const targetDir = resolve(
  repoRoot,
  "web/src/ee/features/in-app-agent/server/skills/raw",
);
const sourceApiUrl =
  "https://api.github.com/repos/langfuse/skills/contents/skills/langfuse/references?ref=main";

const requiredAccess = "LANGFUSE_PROJECT_INTERFACE";

const isCheckMode = process.argv.includes("--check");

const getGitHubHeaders = () => ({
  Accept: "application/vnd.github+json",
  Authorization: process.env.GITHUB_TOKEN
    ? `Bearer ${process.env.GITHUB_TOKEN}`
    : undefined,
  "User-Agent": "langfuse-sync-in-app-agent-raw-skills",
});

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: getGitHubHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}${
        !process.env.GITHUB_TOKEN && (response.status === 404 || response.status === 429)
          ? ". Set GITHUB_TOKEN if the repository is private or CI is hitting GitHub API rate limits."
          : ""
      }`,
    );
  }

  return response.text();
};

const extractFrontmatter = (content) => {
  if (!content.startsWith("---\n")) return null;

  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) return null;

  return content.slice(4, endIndex);
};

const hasOnlyProjectInterfaceAccess = (content) => {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) return false;

  const lines = frontmatter.split("\n");
  const metadataIndex = lines.findIndex((line) => line === "metadata:");
  if (metadataIndex === -1) return false;

  const requiredAccessIndex = lines.findIndex(
    (line, index) => index > metadataIndex && line === "  required_access:",
  );
  if (requiredAccessIndex === -1) return false;

  const accessValues = [];

  for (let i = requiredAccessIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.startsWith("  ") && !line.startsWith("    - ")) {
      break;
    }

    if (!line.startsWith("    - ")) {
      continue;
    }

    accessValues.push(line.slice("    - ".length).trim());
  }

  return accessValues.length === 1 && accessValues[0] === requiredAccess;
};

const listRemoteMarkdownFiles = async () => {
  const response = await fetch(sourceApiUrl, {
    headers: getGitHubHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to list remote skills: ${response.status} ${response.statusText}${
        !process.env.GITHUB_TOKEN && (response.status === 404 || response.status === 429)
          ? ". Set GITHUB_TOKEN if the repository is private or CI is hitting GitHub API rate limits."
          : ""
      }`,
    );
  }

  const entries = await response.json();

  if (!Array.isArray(entries)) {
    throw new Error(
      "Unexpected GitHub API response while listing remote skills",
    );
  }

  return entries
    .filter(
      (entry) =>
        entry.type === "file" &&
        typeof entry.name === "string" &&
        entry.name.endsWith(".md") &&
        typeof entry.download_url === "string",
    )
    .sort((left, right) => left.name.localeCompare(right.name));
};

const getExpectedFiles = async () => {
  const remoteFiles = await listRemoteMarkdownFiles();
  const expectedFiles = [];

  for (const remoteFile of remoteFiles) {
    const content = await fetchText(remoteFile.download_url);

    if (hasOnlyProjectInterfaceAccess(content)) {
      expectedFiles.push({ name: remoteFile.name, content });
    }
  }

  return expectedFiles;
};

const getCurrentManagedFileNames = () =>
  readdirSync(targetDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name !== "README.md",
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

const main = async () => {
  const expectedFiles = await getExpectedFiles();
  const expectedFileNames = expectedFiles.map((file) => file.name);

  mkdirSync(targetDir, { recursive: true });

  if (isCheckMode) {
    const mismatches = [];
    const expectedFileNameSet = new Set(expectedFileNames);

    for (const fileName of getCurrentManagedFileNames()) {
      if (!expectedFileNameSet.has(fileName)) {
        mismatches.push(`${fileName} exists locally but is not expected`);
      }
    }

    for (const { name, content } of expectedFiles) {
      const localPath = resolve(targetDir, name);

      try {
        if (readFileSync(localPath, "utf8") !== content) {
          mismatches.push(`${name} differs from upstream`);
        }
      } catch (error) {
        if (error.code === "ENOENT") {
          mismatches.push(`${name} is missing locally`);
          continue;
        }

        throw error;
      }
    }

    if (mismatches.length > 0) {
      console.error("Raw in-app agent skills are out of sync:");
      for (const mismatch of mismatches) {
        console.error(`- ${mismatch}`);
      }
      process.exit(1);
    }

    console.log(
      `Raw in-app agent skills are in sync: ${expectedFileNames.join(", ")}`,
    );
    return;
  }

  const expectedFileNameSet = new Set(expectedFileNames);

  for (const fileName of getCurrentManagedFileNames()) {
    if (!expectedFileNameSet.has(fileName)) {
      rmSync(resolve(targetDir, fileName));
    }
  }

  for (const { name, content } of expectedFiles) {
    writeFileSync(resolve(targetDir, basename(name)), content);
  }

  console.log(`Synced ${expectedFiles.length} raw in-app agent skills:`);
  for (const fileName of expectedFileNames) {
    console.log(`- ${fileName}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
