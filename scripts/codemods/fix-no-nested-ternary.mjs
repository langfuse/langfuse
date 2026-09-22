#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { parsers as typescriptParsers } from "prettier/plugins/typescript";

const DISABLE_COMMENT =
  /\/\* eslint-disable no-nested-ternary \*\/\s*(?:\r?\n)?/g;
const SOURCE_FILE = /\.(?:c|m)?[jt]sx?$/;
const TRANSPARENT_EXPRESSIONS = new Set([
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TypeCastExpression",
]);
const CONTEXT_SENSITIVE_EXPRESSIONS = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
]);

function unwrapExpression(node) {
  let expression = node;
  while (expression && TRANSPARENT_EXPRESSIONS.has(expression.type)) {
    expression = expression.expression;
  }
  return expression;
}

function isNestedTernary(node) {
  return (
    node?.type === "ConditionalExpression" &&
    (unwrapExpression(node.consequent)?.type === "ConditionalExpression" ||
      unwrapExpression(node.alternate)?.type === "ConditionalExpression")
  );
}

function hasNestedConditionalChild(node) {
  return (
    node?.type === "ConditionalExpression" &&
    [node.test, node.consequent, node.alternate].some(
      (child) => unwrapExpression(child)?.type === "ConditionalExpression",
    )
  );
}

function startOf(node) {
  return node.range[0];
}

function endOf(node) {
  return node.range[1];
}

function containsNodeType(node, types) {
  if (!node || typeof node !== "object") return false;
  if (types.has(node.type)) return true;

  return Object.entries(node).some(([key, value]) => {
    if (key === "comments" || key === "tokens") return false;
    if (Array.isArray(value)) {
      return value.some((child) => containsNodeType(child, types));
    }
    return containsNodeType(value, types);
  });
}

function hasSeparatorComment(node, source) {
  const gaps = [
    source.slice(endOf(node.test), startOf(node.consequent)),
    source.slice(endOf(node.consequent), startOf(node.alternate)),
  ];
  return gaps.some((gap) => gap.includes("//") || gap.includes("/*"));
}

function hasTernarySeparatorComment(node, source) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "ConditionalExpression") return false;
  if (hasSeparatorComment(expression, source)) return true;

  return (
    hasTernarySeparatorComment(expression.consequent, source) ||
    hasTernarySeparatorComment(expression.alternate, source)
  );
}

function renderReturns(node, source) {
  const expression = unwrapExpression(node);
  if (expression?.type !== "ConditionalExpression") {
    return `return ${source.slice(startOf(node), endOf(node))};`;
  }

  return [
    `if (${source.slice(startOf(expression.test), endOf(expression.test))}) {`,
    renderReturns(expression.consequent, source),
    "}",
    renderReturns(expression.alternate, source),
  ].join("\n");
}

function isSafeVariableInitializer(declaration, conditional, source) {
  if (declaration.id.typeAnnotation) return false;
  if (hasTernarySeparatorComment(conditional, source)) return false;

  return !containsNodeType(
    conditional,
    new Set([
      "AwaitExpression",
      "YieldExpression",
      ...CONTEXT_SENSITIVE_EXPRESSIONS,
    ]),
  );
}

function findEdits(ast, source) {
  const edits = [];

  function addEdit(start, end, replacement) {
    if (edits.some((edit) => start < edit.end && end > edit.start)) return;
    edits.push({ start, end, replacement });
  }

  function visit(node) {
    if (!node || typeof node !== "object") return;

    if (node.type === "ReturnStatement") {
      const conditional = unwrapExpression(node.argument);
      if (
        isNestedTernary(conditional) &&
        !hasTernarySeparatorComment(conditional, source)
      ) {
        addEdit(
          startOf(node),
          endOf(node),
          renderReturns(node.argument, source),
        );
        return;
      }
    }

    if (
      node.type === "ArrowFunctionExpression" &&
      node.body.type !== "BlockStatement"
    ) {
      const conditional = unwrapExpression(node.body);
      if (
        isNestedTernary(conditional) &&
        !hasTernarySeparatorComment(conditional, source)
      ) {
        addEdit(
          startOf(node.body),
          endOf(node.body),
          `{\n${renderReturns(node.body, source)}\n}`,
        );
        return;
      }
    }

    if (node.type === "VariableDeclarator") {
      const conditional = unwrapExpression(node.init);
      if (
        isNestedTernary(conditional) &&
        isSafeVariableInitializer(node, conditional, source)
      ) {
        addEdit(
          startOf(node.init),
          endOf(node.init),
          `(() => {\n${renderReturns(node.init, source)}\n})()`,
        );
        return;
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "comments" || key === "tokens") continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === "string") visit(value);
    }
  }

  visit(ast);
  return edits.sort((left, right) => right.start - left.start);
}

async function parse(source, filepath) {
  return typescriptParsers.typescript.parse(source, { filepath });
}

function hasNestedTernary(ast) {
  if (!ast || typeof ast !== "object") return false;
  if (hasNestedConditionalChild(ast)) return true;

  return Object.entries(ast).some(([key, value]) => {
    if (key === "comments" || key === "tokens") return false;
    if (Array.isArray(value)) return value.some(hasNestedTernary);
    return hasNestedTernary(value);
  });
}

export async function transformNoNestedTernary(source, filepath) {
  const ast = await parse(source, filepath);
  const edits = findEdits(ast, source);
  if (edits.length === 0) return source;

  let transformed = source;
  for (const edit of edits) {
    transformed = `${transformed.slice(0, edit.start)}${edit.replacement}${transformed.slice(edit.end)}`;
  }

  const transformedAst = await parse(transformed, filepath);
  if (!hasNestedTernary(transformedAst)) {
    transformed = transformed.replace(DISABLE_COMMENT, "");
  }

  return prettier.format(transformed, { filepath });
}

function trackedSourceFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => SOURCE_FILE.test(file) && fs.existsSync(file));
}

async function main() {
  const files = process.argv.slice(2);
  const candidates = files.length > 0 ? files : trackedSourceFiles();
  let changedFiles = 0;

  for (const file of candidates) {
    const filepath = path.resolve(file);
    const source = fs.readFileSync(filepath, "utf8");
    if (!source.includes("eslint-disable no-nested-ternary")) continue;

    const transformed = await transformNoNestedTernary(source, filepath);
    if (transformed === source) continue;

    fs.writeFileSync(filepath, transformed);
    changedFiles += 1;
    console.log(path.relative(process.cwd(), filepath));
  }

  console.log(`Updated ${changedFiles} file(s).`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
