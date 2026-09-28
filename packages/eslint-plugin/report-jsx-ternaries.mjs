#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const files = execFileSync("git", ["ls-files", "-z", "--", "*.tsx", "*.jsx"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20_000_000,
})
  .split("\0")
  .filter(Boolean);

// Only syntactically boolean expressions are safe to use as the left side of
// `&&` in JSX. Unknown values can render 0, NaN, or an empty string.
function isBooleanExpression(node) {
  if (node.type === "Literal") return typeof node.value === "boolean";
  if (node.type === "UnaryExpression") return node.operator === "!";
  if (node.type === "BinaryExpression") {
    return [
      "==",
      "===",
      "!=",
      "!==",
      "<",
      "<=",
      ">",
      ">=",
      "in",
      "instanceof",
    ].includes(node.operator);
  }
  if (node.type === "LogicalExpression") {
    return isBooleanExpression(node.left) && isBooleanExpression(node.right);
  }
  if (node.type === "ConditionalExpression") {
    return (
      isBooleanExpression(node.consequent) &&
      isBooleanExpression(node.alternate)
    );
  }
  return false;
}

function conditions(node) {
  const result = [node.test];
  for (const branch of [node.consequent, node.alternate]) {
    if (branch.type === "ConditionalExpression")
      result.push(...conditions(branch));
  }
  return result;
}

const findings = [];
for (const file of files) {
  const source = readFileSync(`${root}/${file}`, "utf8");
  let ast;
  try {
    ast = parser.parse(source, {
      jsx: true,
      ecmaVersion: "latest",
      sourceType: "module",
      loc: true,
    });
  } catch (error) {
    console.error(`Could not parse ${file}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }

  function visit(node, inJsx = false, inBranch = false) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "JSXExpressionContainer") {
      visit(node.expression, true);
      return;
    }
    if (inJsx && node.type === "ConditionalExpression") {
      const nested = [node.consequent, node.alternate].some(
        (branch) => branch.type === "ConditionalExpression",
      );
      if (nested && !inBranch) {
        findings.push({
          file,
          line: node.loc.start.line,
          category: conditions(node).every(isBooleanExpression)
            ? "boolean conditions"
            : "review conditions",
        });
      }
      visit(node.test, true);
      visit(node.consequent, true, true);
      visit(node.alternate, true, true);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      if (Array.isArray(value))
        value.forEach((child) => visit(child, inJsx, inBranch));
      else visit(value, inJsx, inBranch);
    }
  }
  visit(ast);
}

const counts = new Map();
for (const finding of findings) {
  counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
}
console.log(`Scanned ${files.length} tracked JSX/TSX files`);
console.log(
  `${findings.length} nested JSX ternaries in ${new Set(findings.map((f) => f.file)).size} files`,
);
for (const [category, count] of counts) console.log(`${category}: ${count}`);
for (const { file, line, category } of findings)
  console.log(`${file}:${line} ${category}`);
