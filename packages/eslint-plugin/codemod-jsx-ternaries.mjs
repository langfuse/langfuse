#!/usr/bin/env node
// Run `pnpm --filter @repo/eslint-plugin codemod:jsx-ternaries` to preview,
// or append `--write` to apply. Pass repo-relative file paths to limit scope.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");
const ts = require("typescript");

function projectFor(file, root, cache) {
  let directory = dirname(file);
  while (directory.startsWith(root)) {
    const config = join(directory, "tsconfig.json");
    if (existsSync(config)) {
      if (!cache.has(config)) {
        const read = ts.readConfigFile(config, ts.sys.readFile);
        if (read.error)
          throw new Error(
            ts.flattenDiagnosticMessageText(read.error.messageText, "\n"),
          );
        const parsed = ts.parseJsonConfigFileContent(
          read.config,
          ts.sys,
          directory,
        );
        if (parsed.errors.length)
          throw new Error(
            ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, "\n"),
          );
        const program = ts.createProgram(parsed.fileNames, parsed.options);
        cache.set(config, program);
      }
      const program = cache.get(config);
      const sourceFile = program.getSourceFile(file);
      return sourceFile
        ? { checker: program.getTypeChecker(), sourceFile }
        : null;
    }
    if (directory === root) break;
    directory = dirname(directory);
  }
  return null;
}

function typescriptIdentifier(node, sourceFile) {
  if (node.type !== "Identifier") return null;
  let found;
  function find(current) {
    if (
      current.getStart(sourceFile) > node.range[0] ||
      current.end < node.range[1]
    )
      return;
    if (
      ts.isIdentifier(current) &&
      current.getStart(sourceFile) === node.range[0] &&
      current.end === node.range[1]
    ) {
      found = current;
      return;
    }
    ts.forEachChild(current, find);
  }
  find(sourceFile);
  return found;
}

function typedBoolean(node, project) {
  if (!project) return false;
  const { checker, sourceFile } = project;
  const found = typescriptIdentifier(node, sourceFile);
  if (!found) return false;
  const type = checker.getTypeAtLocation(found);
  const members = type.isUnion() ? type.types : [type];
  // Never treat `any`, `unknown`, or truthy/falsy non-booleans as JSX guards.
  return members.every(
    (member) => (member.flags & ts.TypeFlags.BooleanLike) !== 0,
  );
}

function stablePrimitive(node, project) {
  if (node.type === "Literal") return stableValue(node);
  if (node.type !== "Identifier" || !project) return false;
  const { checker, sourceFile } = project;
  const identifier = typescriptIdentifier(node, sourceFile);
  if (!identifier) return false;
  const symbol = checker.getSymbolAtLocation(identifier);
  if (!symbol?.declarations?.length) return false;
  const supported = symbol.declarations.every((declaration) => {
    let owner = declaration;
    while (
      ts.isBindingElement(owner) ||
      ts.isObjectBindingPattern(owner) ||
      ts.isArrayBindingPattern(owner)
    )
      owner = owner.parent;
    if (ts.isParameter(owner)) return true;
    return (
      ts.isVariableDeclaration(owner) &&
      (owner.parent.flags & ts.NodeFlags.Const) !== 0
    );
  });
  if (!supported) return false;
  const type = checker.getTypeAtLocation(identifier);
  const members = type.isUnion() ? type.types : [type];
  if (
    !members.every(
      (member) =>
        (member.flags &
          (ts.TypeFlags.StringLike |
            ts.TypeFlags.NumberLike |
            ts.TypeFlags.BooleanLike |
            ts.TypeFlags.BigIntLike |
            ts.TypeFlags.Null |
            ts.TypeFlags.Undefined)) !==
        0,
    )
  )
    return false;

  // Parameter bindings are writable. A later JSX branch could otherwise
  // reassign one between guard checks even though its type is primitive.
  function hasWrite(current) {
    if (
      ts.isIdentifier(current) &&
      checker.getSymbolAtLocation(current) === symbol
    ) {
      let ancestor = current.parent;
      while (ancestor && ancestor !== sourceFile) {
        if (
          ts.isBinaryExpression(ancestor) &&
          current.pos >= ancestor.left.pos &&
          current.end <= ancestor.left.end &&
          ancestor.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          ancestor.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        )
          return true;
        if (
          (ts.isPrefixUnaryExpression(ancestor) ||
            ts.isPostfixUnaryExpression(ancestor)) &&
          [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
            ancestor.operator,
          )
        )
          return true;
        if (
          (ts.isForInStatement(ancestor) || ts.isForOfStatement(ancestor)) &&
          current.pos >= ancestor.initializer.pos &&
          current.end <= ancestor.initializer.end
        )
          return true;
        ancestor = ancestor.parent;
      }
    }
    return ts.forEachChild(current, hasWrite) ?? false;
  }
  return !hasWrite(sourceFile);
}

function emptyValue(node, project) {
  if (node.type === "Literal" && node.value === null) return true;
  if (node.type !== "Identifier" || node.name !== "undefined" || !project)
    return false;
  const identifier = typescriptIdentifier(node, project.sourceFile);
  if (!identifier) return false;
  const symbol = project.checker.getSymbolAtLocation(identifier);
  if (symbol?.name !== "undefined") return false;
  // A shadowed `undefined` may hold any value; only the lib declaration is safe.
  return (
    (!symbol.declarations?.length ||
      symbol.declarations.every((declaration) =>
        /[/\\]lib\.[\w.]+\.d\.ts$/.test(declaration.getSourceFile().fileName),
      )) &&
    (project.checker.getTypeAtLocation(identifier).flags &
      ts.TypeFlags.Undefined) !==
      0
  );
}

function stableGuard(node, project) {
  if (stablePrimitive(node, project)) return true;
  if (node.type === "UnaryExpression" && node.operator === "!")
    return stableGuard(node.argument, project);
  if (node.type === "LogicalExpression")
    return stableGuard(node.left, project) && stableGuard(node.right, project);
  if (node.type === "BinaryExpression") {
    return (
      ["===", "!==", "<", "<=", ">", ">="].includes(node.operator) &&
      stablePrimitive(node.left, project) &&
      stablePrimitive(node.right, project)
    );
  }
  return false;
}

function stableValue(node) {
  if (node.type === "Identifier") return true;
  if (node.type === "Literal")
    return (
      node.value === null ||
      ["string", "number", "boolean"].includes(typeof node.value)
    );
  if (node.type === "UnaryExpression" && node.operator === "!")
    return stableValue(node.argument);
  return false;
}

function booleanTest(node, project) {
  if (node.type === "Identifier") return typedBoolean(node, project);
  if (node.type === "Literal") return typeof node.value === "boolean";
  if (node.type === "UnaryExpression" && node.operator === "!")
    return stableValue(node.argument);
  if (node.type === "BinaryExpression") {
    return (
      ["===", "!=="].includes(node.operator) &&
      stableValue(node.left) &&
      stableValue(node.right)
    );
  }
  if (node.type === "LogicalExpression")
    return booleanTest(node.left, project) && booleanTest(node.right, project);
  return false;
}

// A previously rendered branch must not change a condition that later clauses
// re-evaluate. Only primitive literal leaves are inert by construction.
function inertLeaf(node) {
  return node.type === "Literal" && stableValue(node);
}

function paths(node, guards = [], result = []) {
  if (node.type === "ConditionalExpression") {
    paths(node.consequent, [...guards, [node.test, true]], result);
    paths(node.alternate, [...guards, [node.test, false]], result);
  } else {
    result.push({ guards, leaf: node });
  }
  return result;
}

export function transform(source, file = "input.tsx", project = null) {
  const ast = parser.parse(source, {
    jsx: true,
    ecmaVersion: "latest",
    sourceType: "module",
    range: true,
    loc: true,
    comment: true,
    filePath: file,
  });
  const changes = [];
  const skipped = [];
  let rewrites = 0;
  const text = (node) => source.slice(...node.range);

  function stringInputs(node, names) {
    if (node.type === "Identifier") {
      if (!stablePrimitive(node, project)) return false;
      names.set(node.name, node);
      return true;
    }
    if (node.type === "Literal") return stableValue(node);
    if (node.type === "TemplateLiteral")
      return (
        node.expressions.filter(
          (expression) => expression.type === "ConditionalExpression",
        ).length <= 1 &&
        node.expressions.every(
          (expression) =>
            expression.type !== "ConditionalExpression" ||
            (source.slice(expression.range[0] - 2, expression.range[0]) ===
              "${" &&
              source[expression.range[1]] === "}"),
        ) &&
        node.expressions.every((expression) => stringInputs(expression, names))
      );
    if (node.type === "ConditionalExpression")
      return (
        stableGuard(node.test, project) &&
        node.consequent.type === "Literal" &&
        typeof node.consequent.value === "string" &&
        /^[\w -]+$/.test(node.consequent.value) &&
        node.alternate.type === "Literal" &&
        typeof node.alternate.value === "string" &&
        /^[\w -]+$/.test(node.alternate.value) &&
        stringInputs(node.test, names) &&
        stringInputs(node.consequent, names) &&
        stringInputs(node.alternate, names)
      );
    if (node.type === "BinaryExpression")
      return stringInputs(node.left, names) && stringInputs(node.right, names);
    if (node.type === "LogicalExpression")
      return stringInputs(node.left, names) && stringInputs(node.right, names);
    if (node.type === "UnaryExpression" && node.operator === "!")
      return stringInputs(node.argument, names);
    return false;
  }

  function withInputs(node, parameter, replacement = null) {
    const edits = [];
    function collect(current) {
      if (current === replacement?.node) {
        edits.push({
          range: [current.range[0] - 2, current.range[1] + 1],
          value: replacement.branch.value,
        });
        return;
      }
      if (current.type === "Identifier") {
        edits.push({
          range: current.range,
          value: `${parameter}.${current.name}`,
        });
        return;
      }
      for (const [key, value] of Object.entries(current)) {
        if (["range", "loc", "parent"].includes(key)) continue;
        if (Array.isArray(value))
          value.forEach((child) => child?.type && collect(child));
        else if (value?.type) collect(value);
      }
    }
    collect(node);
    let result = text(node);
    for (const edit of edits.sort((a, b) => b.range[0] - a.range[0])) {
      const offset = edit.range[0] - node.range[0];
      result =
        result.slice(0, offset) +
        edit.value +
        result.slice(edit.range[1] - node.range[0]);
    }
    return result;
  }

  function stringHelper(expression, alternatives, container, ancestors) {
    const statement = [...ancestors]
      .reverse()
      .find((node) => node.type === "ReturnStatement");
    if (!statement || statement.argument?.range[0] > container.range[0])
      return false;
    const block = ancestors[ancestors.indexOf(statement) - 1];
    if (block?.type !== "BlockStatement") return false;
    const names = new Map();
    if (
      !alternatives.every(
        ({ guards, leaf }) =>
          ((leaf.type === "Literal" && typeof leaf.value === "string") ||
            leaf.type === "TemplateLiteral") &&
          stringInputs(leaf, names) &&
          guards.every(
            ([test]) => stableGuard(test, project) && stringInputs(test, names),
          ),
      )
    )
      return false;
    if (
      ast.comments.some(
        (comment) =>
          comment.range[0] >= container.range[0] &&
          comment.range[1] <= container.range[1],
      )
    )
      return false;
    if (
      [...names.values()].some((node) => {
        const identifier = typescriptIdentifier(node, project.sourceFile);
        const symbol =
          identifier && project.checker.getSymbolAtLocation(identifier);
        return !symbol?.declarations?.every(
          (declaration) =>
            declaration.getSourceFile() === project.sourceFile &&
            declaration.getStart(project.sourceFile) < statement.range[0],
        );
      })
    )
      return false;
    const helper = "getConditionalText";
    const parameter = "__nestedTernaryValues";
    if (
      source.includes(helper) ||
      changes.some((change) =>
        change.replacement.includes(`function ${helper}`),
      ) ||
      names.has(parameter)
    )
      return false;
    const inputs = [...names.keys()];
    function render(current) {
      if (current.type === "ConditionalExpression") {
        return `if (${withInputs(current.test, parameter)}) {\n${render(current.consequent)}\n}\n${render(current.alternate)}`;
      }
      if (current.type === "TemplateLiteral") {
        const conditional = current.expressions.find(
          (child) => child.type === "ConditionalExpression",
        );
        if (conditional) {
          return `if (${withInputs(conditional.test, parameter)}) return ${withInputs(current, parameter, { node: conditional, branch: conditional.consequent })};\nreturn ${withInputs(current, parameter, { node: conditional, branch: conditional.alternate })};`;
        }
      }
      return `return ${withInputs(current, parameter)};`;
    }
    const lines = render(expression);
    const declaration = `function ${helper}(${parameter}: { ${inputs.map((name) => `${name}: typeof ${name}`).join("; ")} }) {\n${lines}\n}\n`;
    changes.push({
      start: statement.range[0],
      end: statement.range[0],
      replacement: declaration,
    });
    changes.push({
      start: container.range[0],
      end: container.range[1],
      replacement: `{${helper}({ ${inputs.join(", ")} })}`,
    });
    rewrites++;
    return true;
  }

  function visit(node, parent = null, ancestors = []) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "JSXExpressionContainer") {
      const expression = node.expression;
      if (
        (parent?.type === "JSXElement" || parent?.type === "JSXFragment") &&
        expression.type === "LogicalExpression" &&
        expression.operator === "&&" &&
        emptyValue(expression.right, project) &&
        stableGuard(expression.left, project) &&
        !ast.comments.some(
          (comment) =>
            comment.range[0] >= node.range[0] &&
            comment.range[1] <= node.range[1],
        )
      ) {
        changes.push({
          start: node.range[0],
          end: node.range[1],
          replacement: "",
        });
        rewrites++;
        return;
      }
      if (expression.type === "ConditionalExpression") {
        const alternatives = paths(expression);
        if (alternatives.length > 2) {
          const parentIsChild =
            parent?.type === "JSXElement" || parent?.type === "JSXFragment";
          if (
            parentIsChild &&
            stringHelper(expression, alternatives, node, ancestors)
          )
            return;
          const comments = ast.comments.filter(
            (comment) =>
              comment.range[0] >= node.range[0] &&
              comment.range[1] <= node.range[1],
          );
          const prefixes = new Map();
          const covered = (comment, expression) =>
            comment.range[0] >= expression.range[0] &&
            comment.range[1] <= expression.range[1];
          const commentIsPreserved = (comment) => {
            if (
              alternatives.some(
                ({ guards, leaf }) =>
                  covered(comment, leaf) ||
                  guards.some(([test]) => covered(comment, test)),
              )
            )
              return true;

            function attach(conditional) {
              if (conditional.type !== "ConditionalExpression") return false;
              for (const [branch, start, separator] of [
                [conditional.consequent, conditional.test.range[1], "?"],
                [conditional.alternate, conditional.consequent.range[1], ":"],
              ]) {
                const gap = source.slice(start, branch.range[0]);
                const separatorIndex = gap.indexOf(separator);
                if (
                  branch.type !== "ConditionalExpression" &&
                  separatorIndex !== -1 &&
                  comment.range[0] > start + separatorIndex &&
                  comment.range[1] <= branch.range[0]
                ) {
                  prefixes.set(branch.range[0], [
                    ...(prefixes.get(branch.range[0]) ?? []),
                    comment,
                  ]);
                  return true;
                }
                if (attach(branch)) return true;
              }
              return false;
            }
            return attach(expression);
          };
          const commentsPreserved = comments.every(commentIsPreserved);
          const renderedPrefixes = new Map();
          for (const [position, attached] of prefixes) {
            let prefix = "";
            let end = attached[0].range[0];
            for (const comment of attached) {
              const between = source.slice(end, comment.range[0]);
              if (!/^[\s(]*$/.test(between)) break;
              prefix += between + source.slice(...comment.range);
              end = comment.range[1];
            }
            const trailing = source.slice(end, position);
            if (!/^[\s(]*$/.test(trailing)) break;
            renderedPrefixes.set(
              position,
              prefix + (trailing.match(/\s*$/)[0] || "\n"),
            );
          }
          const safe =
            parentIsChild &&
            commentsPreserved &&
            renderedPrefixes.size === prefixes.size &&
            (alternatives.every(({ guards }) =>
              guards.every(([test]) => stableGuard(test, project)),
            ) ||
              alternatives.every(
                ({ guards, leaf }) =>
                  inertLeaf(leaf) &&
                  guards.every(([test]) => booleanTest(test, project)),
              ));
          if (safe) {
            const replacement = alternatives
              .filter(({ guards, leaf }) => {
                if (!emptyValue(leaf, project)) return true;
                if (!guards.every(([test]) => stableGuard(test, project)))
                  return true;
                if (renderedPrefixes.has(leaf.range[0])) return true;
                return comments.some(
                  (comment) =>
                    comment.range[0] >= leaf.range[0] &&
                    comment.range[1] <= leaf.range[1],
                );
              })
              .map(({ guards, leaf }) => {
                const checks = guards.map(([test, positive]) =>
                  positive ? `!!(${text(test)})` : `!(${text(test)})`,
                );
                const prefix = renderedPrefixes.get(leaf.range[0]) ?? "";
                return `{${checks.join(" && ")} && (${prefix}${text(leaf)})}`;
              })
              .join("\n");
            changes.push({
              start: node.range[0],
              end: node.range[1],
              replacement,
            });
            rewrites++;
            return;
          }
          skipped.push(`${file}:${node.loc.start.line}`);
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["parent", "range", "loc", "tokens", "comments"].includes(key))
        continue;
      if (Array.isArray(value))
        value.forEach((child) => visit(child, node, [...ancestors, node]));
      else visit(value, node, [...ancestors, node]);
    }
  }
  visit(ast);

  let output = source;
  for (const { start, end, replacement } of changes.sort(
    (a, b) => b.start - a.start,
  )) {
    output = output.slice(0, start) + replacement + output.slice(end);
  }
  if (changes.length) {
    parser.parse(output, {
      jsx: true,
      ecmaVersion: "latest",
      sourceType: "module",
      filePath: file,
    });
  }
  return { output, changed: rewrites, skipped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const requested = args.filter((arg) => arg !== "--write");
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const files = requested.length
    ? requested.map((file) => (isAbsolute(file) ? file : resolve(root, file)))
    : execFileSync("git", ["ls-files", "-z", "--", "*.tsx", "*.jsx"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 20_000_000,
      })
        .split("\0")
        .filter(Boolean)
        .map((file) => `${root}/${file}`);
  let changed = 0;
  let skipped = 0;
  const programs = new Map();
  for (const file of files) {
    try {
      const original = readFileSync(file, "utf8");
      const project = projectFor(file, root, programs);
      const result = transform(original, file, project);
      changed += result.changed;
      skipped += result.skipped.length;
      if (result.changed) {
        console.log(`${file}: ${result.changed} safe rewrite(s)`);
        if (write) writeFileSync(file, result.output);
      }
    } catch (error) {
      console.error(`${file}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  console.log(
    `${changed} safe rewrites, ${skipped} skipped (${write ? "written" : "dry run"})`,
  );
}
