#!/usr/bin/env node

import fs from "node:fs";

const args = process.argv.slice(2);
const readArgument = (name) => {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return args[index + 1];
};

const basePath = readArgument("--base");
const currentPath = readArgument("--current");
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));

const canonicalize = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const entriesByModel = (entries) => {
  const result = new Map();
  for (const entry of entries) {
    const modelName = entry.modelName.trim().toLowerCase();
    if (result.has(modelName)) return null;
    result.set(modelName, JSON.stringify(canonicalize(entry)));
  }
  return result;
};

const baseByModel = entriesByModel(base);
const currentByModel = entriesByModel(current);
const sameEntries =
  baseByModel !== null &&
  currentByModel !== null &&
  baseByModel.size === currentByModel.size &&
  [...baseByModel].every(
    ([modelName, entry]) => currentByModel.get(modelName) === entry,
  );

if (
  sameEntries &&
  fs.readFileSync(basePath, "utf8") !== fs.readFileSync(currentPath, "utf8")
) {
  fs.copyFileSync(basePath, currentPath);
  console.log(
    "Discarded pricing JSON formatting or ordering changes without model-entry changes.",
  );
}
