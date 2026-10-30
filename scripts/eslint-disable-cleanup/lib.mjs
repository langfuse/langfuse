import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export const MAX_CHANGED_LINES = 199;
export const MAX_FILE_DIRECTIVES = 6;
export const MAX_RULE_DIRECTIVES = 6;
export const MAX_RULE_FILES = 4;

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".cts",
  ".mts",
]);

const EXCLUDED_PREFIXES = [
  "generated/",
  "web/.next/",
  "web/src/workers/generated/",
  "packages/shared/prisma/generated/",
  "packages/native/index.js",
  "packages/native/index.d.ts",
];

const SAFE_PATH = /^[A-Za-z0-9_./@+-]+$/;

const DIRECTIVE_PATTERN =
  /(?:\/\/|\/\*)\s*(eslint-disable-next-line|eslint-disable-line|eslint-disable)\b([^\n*]*)/g;

export function isScannablePath(filePath) {
  if (!SAFE_PATH.test(filePath)) return false;
  if (filePath.split("/").includes("node_modules")) return false;
  if (filePath.split("/").includes("dist")) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return false;
  }
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return false;
  return SOURCE_EXTENSIONS.has(filePath.slice(dot));
}

export function parseDirectives(source, file) {
  const directives = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    DIRECTIVE_PATTERN.lastIndex = 0;
    let match = DIRECTIVE_PATTERN.exec(line);
    while (match) {
      const kind = match[1];
      const rules = parseRuleList(match[2]);
      directives.push({
        file,
        line: index + 1,
        kind,
        rules,
        raw: match[0].trim(),
      });
      match = DIRECTIVE_PATTERN.exec(line);
    }
  }
  return directives;
}

export function parseRuleList(rawTail) {
  const withoutDescription = rawTail.split("--")[0] ?? "";
  const rules = withoutDescription
    .split(",")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0 && !rule.startsWith("*"));
  if (rules.length === 0) return ["*"];
  return [...rules].sort();
}

export function directiveKey(directive) {
  return `${directive.file}\0${directive.kind}\0${directive.rules.join(",")}`;
}

export function occurrenceKey(directive, ordinal) {
  return `issue:${directive.file}:${directive.kind}:${directive.rules.join("+")}:${ordinal}`;
}

export function fileBatchKey(file) {
  return `file:${file}`;
}

export function ruleBatchKey(rule) {
  return `rule:${rule}`;
}

export function branchNameForBatch(batchKey) {
  const digest = createHash("sha256").update(batchKey).digest("hex").slice(0, 12);
  return `eslint-disable-bot/${digest}`;
}

export function countByKey(directives) {
  const counts = new Map();
  for (const directive of directives) {
    const key = directiveKey(directive);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function diffDirectiveCounts(before, after) {
  const beforeCounts = countByKey(before);
  const afterCounts = countByKey(after);
  const keys = new Set([...beforeCounts.keys(), ...afterCounts.keys()]);
  const removed = new Map();
  const added = new Map();
  for (const key of keys) {
    const delta = (beforeCounts.get(key) ?? 0) - (afterCounts.get(key) ?? 0);
    if (delta > 0) removed.set(key, delta);
    if (delta < 0) added.set(key, -delta);
  }
  return { removed, added };
}

export function selectBatch({ directives, skippedKeys = [], blockedFiles = [] }) {
  const skipped = new Set(skippedKeys);
  const blocked = new Set(blockedFiles);
  const byFile = groupBy(directives, (directive) => directive.file);
  const fileEntries = [...byFile.entries()].sort((left, right) => {
    if (left[1].length !== right[1].length) return left[1].length - right[1].length;
    return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
  });

  for (const [file, fileDirectives] of fileEntries) {
    if (blocked.has(file)) continue;
    if (fileDirectives.length < 1 || fileDirectives.length > MAX_FILE_DIRECTIVES) continue;
    const batchKey = fileBatchKey(file);
    if (skipped.has(batchKey)) continue;
    return {
      batchKey,
      mode: "file",
      rule: null,
      files: [file],
      directives: fileDirectives,
    };
  }

  const issueCandidates = [];
  for (const [file, fileDirectives] of byFile) {
    if (blocked.has(file)) continue;
    const seen = new Map();
    for (const directive of fileDirectives) {
      const identity = `${directive.kind}:${directive.rules.join("+")}`;
      const ordinal = seen.get(identity) ?? 0;
      seen.set(identity, ordinal + 1);
      issueCandidates.push({
        directive,
        batchKey: occurrenceKey(directive, ordinal),
      });
    }
  }
  issueCandidates.sort((left, right) => {
    if (left.directive.file !== right.directive.file) {
      return left.directive.file < right.directive.file ? -1 : 1;
    }
    return left.directive.line - right.directive.line;
  });
  for (const candidate of issueCandidates) {
    if (skipped.has(candidate.batchKey)) continue;
    return {
      batchKey: candidate.batchKey,
      mode: "issue",
      rule: candidate.directive.rules.length === 1 ? candidate.directive.rules[0] : null,
      files: [candidate.directive.file],
      directives: [candidate.directive],
    };
  }

  const singleRule = directives.filter((directive) => directive.rules.length === 1);
  const byRule = groupBy(singleRule, (directive) => directive.rules[0]);
  const ruleEntries = [...byRule.entries()]
    .filter(([, group]) => group.length >= 2 && group.length <= MAX_RULE_DIRECTIVES)
    .sort((left, right) => {
      if (left[1].length !== right[1].length) return left[1].length - right[1].length;
      return left[0] < right[0] ? -1 : 1;
    });

  for (const [rule, group] of ruleEntries) {
    const files = [...new Set(group.map((directive) => directive.file))].sort();
    if (files.length > MAX_RULE_FILES) continue;
    if (files.some((file) => blocked.has(file))) continue;
    const batchKey = ruleBatchKey(rule);
    if (skipped.has(batchKey)) continue;
    return {
      batchKey,
      mode: "rule",
      rule,
      files,
      directives: [...group].sort((left, right) => {
        if (left.file !== right.file) return left.file < right.file ? -1 : 1;
        return left.line - right.line;
      }),
    };
  }

  return null;
}

export function buildAllowedTools(files) {
  const staticReads = [
    "Read(/.agents/skills/eslint-disable-cleanup/SKILL.md)",
    "Read(/.agents/skills/eslint-disable-cleanup/references/*.md)",
    "Read(/web/eslint.config.mjs)",
    "Read(/worker/eslint.config.mjs)",
    "Read(/packages/shared/eslint.config.mjs)",
    "Read(/ee/eslint.config.mjs)",
    "Read(/scripts/eslint-disable-cleanup/lib.mjs)",
  ];
  const fileTools = [];
  for (const file of files) {
    if (!isScannablePath(file)) {
      throw new Error(`Refusing to grant edit access for an unsafe path: ${file}`);
    }
    fileTools.push(`Read(/${file})`, `Edit(/${file})`);
  }
  fileTools.push("Bash(node scripts/eslint-disable-cleanup/lint-changed.mjs)");
  return [...staticReads, ...fileTools].join(",");
}

export function validateBatchEdit({
  beforeByFile,
  afterByFile,
  batch,
  changedFiles,
  changedLineCount,
  allowUnchangedDirectives = false,
}) {
  const errors = [];
  const expected = new Set(batch.files);
  for (const file of changedFiles) {
    if (!expected.has(file)) {
      errors.push(`Changed file is outside the selected batch: ${file}`);
    }
  }
  if (changedLineCount > MAX_CHANGED_LINES) {
    errors.push(
      `Diff has ${changedLineCount} changed lines; the cap is ${MAX_CHANGED_LINES}`,
    );
  }
  if (new Set(changedFiles).size !== changedFiles.length) {
    errors.push("Changed file list contains duplicates");
  }

  if (!allowUnchangedDirectives) {
    const selectedCounts = countByKey(batch.directives);
    const removed = new Map();
    const added = new Map();
    for (const file of batch.files) {
      const fileDiff = diffDirectiveCounts(
        beforeByFile.get(file) ?? [],
        afterByFile.get(file) ?? [],
      );
      for (const [key, count] of fileDiff.removed) {
        removed.set(key, (removed.get(key) ?? 0) + count);
      }
      for (const [key, count] of fileDiff.added) {
        added.set(key, (added.get(key) ?? 0) + count);
      }
    }
    if (added.size > 0) {
      errors.push("eslint-disable comments were added or widened");
    }
    for (const [key, count] of selectedCounts) {
      if ((removed.get(key) ?? 0) !== count) {
        errors.push(`Selected disable comment was not removed: ${key}`);
      }
    }
    for (const [key, count] of removed) {
      if ((selectedCounts.get(key) ?? 0) !== count) {
        errors.push(`A disable comment outside the selected batch was removed: ${key}`);
      }
    }
  } else {
    for (const file of changedFiles) {
      const fileDiff = diffDirectiveCounts(
        beforeByFile.get(file) ?? [],
        afterByFile.get(file) ?? [],
      );
      if (fileDiff.added.size > 0) {
        errors.push(`eslint-disable comments were added or widened in ${file}`);
      }
    }
  }

  return errors;
}

export function renderPullRequestBody({ batch, summary, validation, dryRunMode }) {
  const files = batch.files.map((file) => `- \`${file}\``).join("\n");
  const directives = batch.directives
    .map(
      (directive) =>
        `- \`${directive.file}:${directive.line}\` \`${directive.kind}\` ${directive.rules.join(", ")}`,
    )
    .join("\n");
  const lines = [
    dryRunMode && dryRunMode !== "disabled"
      ? `**Dry run mode:** \`${dryRunMode}\`\n\nThis artifact was generated to debug post-agent workflow steps. The publish job is skipped for dry runs.\n`
      : "",
    "Removes selected `eslint-disable` comments by fixing the lint violation, or by deleting a disable that no longer fires.",
    "",
    `Batch-Key: ${batch.batchKey}`,
    `Batch-Mode: ${batch.mode}`,
    `Batch-Files: ${batch.files.join(",")}`,
    "",
    "### Files",
    files,
    "",
    "### Directives",
    directives,
    "",
    "### Agent summary",
    summary || "No summary provided.",
    "",
    "### Validation",
    ...(validation.length > 0 ? validation.map((item) => `- ${item}`) : ["- none"]),
    "",
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}

export function parseOpenBatchMetadata(pullRequests) {
  const skippedKeys = [];
  const blockedFiles = [];
  for (const pullRequest of pullRequests) {
    const body = pullRequest.body ?? "";
    const key = body.match(/^Batch-Key:\s*(\S+)\s*$/m)?.[1];
    const files = body.match(/^Batch-Files:\s*(\S+)\s*$/m)?.[1];
    if (key) skippedKeys.push(key);
    if (files) blockedFiles.push(...files.split(",").filter(Boolean));
  }
  return { skippedKeys, blockedFiles };
}

export function lintFiles(files, { cwd = process.cwd() } = {}) {
  for (const file of files) {
    if (!isScannablePath(file)) {
      throw new Error(`Refusing to lint an unsafe path: ${file}`);
    }
  }
  const result = spawnSync(
    "pnpm",
    ["exec", "eslint", "--max-warnings", "0", "--no-error-on-unmatched-pattern", ...files],
    { cwd, encoding: "utf8" },
  );
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message ?? result.error) : "",
  };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
