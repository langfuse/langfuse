#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const defaultFile = path.resolve(
  repoRoot,
  "worker/src/constants/default-model-prices.json",
);
const args = process.argv.slice(2);

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function readListOption(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return [];
  }

  const values = [];
  for (let i = index + 1; i < args.length; i += 1) {
    if (args[i].startsWith("--")) {
      break;
    }
    values.push(args[i]);
  }
  return values;
}

function compilePattern(rawPattern) {
  let source = rawPattern;
  let flags = "";
  const inlineFlags = rawPattern.match(/^\(\?([dgimsuvy]*)\)/);

  if (inlineFlags) {
    flags = inlineFlags[1];
    source = rawPattern.slice(inlineFlags[0].length);
  }

  return new RegExp(source, flags);
}

let pattern = readOption("--pattern");
const modelName = readOption("--model");
const accepted = readListOption("--accept");
const rejected = readListOption("--reject");

if (!pattern && !modelName) {
  console.error("Pass either --pattern <regex> or --model <modelName>.");
  process.exit(1);
}

if (accepted.length === 0 && rejected.length === 0) {
  console.error("Provide samples with --accept and/or --reject.");
  process.exit(1);
}

if (!pattern && modelName) {
  const models = JSON.parse(await fs.readFile(defaultFile, "utf8"));
  const model = models.find((entry) => entry.modelName === modelName);

  if (!model) {
    console.error(`Model not found in pricing file: ${modelName}`);
    process.exit(1);
  }

  pattern = model.matchPattern;
}

let regex;
try {
  regex = compilePattern(pattern);
} catch (error) {
  console.error(`Invalid pattern: ${error.message}`);
  process.exit(1);
}

const failures = [];

for (const sample of accepted) {
  const matched = regex.test(sample);
  console.log(`${matched ? "PASS" : "FAIL"} accept ${sample}`);
  if (!matched) {
    failures.push(`Expected pattern to match: ${sample}`);
  }
}

for (const sample of rejected) {
  const matched = regex.test(sample);
  console.log(`${!matched ? "PASS" : "FAIL"} reject ${sample}`);
  if (matched) {
    failures.push(`Expected pattern to reject: ${sample}`);
  }
}

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("");
console.log(
  `Pattern is valid for ${accepted.length + rejected.length} sample(s).`,
);
