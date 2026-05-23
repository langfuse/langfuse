import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const TARGETS = ["src/features/spielwiese", "src/pages/dev/spielwiese.tsx"];

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const CLASSNAME_HELPERS = new Set(["cn", "clsx"]);

const RAW_PALETTE_UTILITY_PATTERN =
  /^(bg|text|border|divide|ring|from|via|to|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)(?:\/[0-9]+)?$/;

const DARK_COLOR_OVERRIDE_PATTERN =
  /(^|:)dark:.*(?:^|:)(bg-|text-|border-|divide-|ring-|from-|via-|to-)/;

const IMPORTANT_TAILWIND_PATTERN = /(^|:)![^\s:]+/;

/**
 * @typedef {{
 *   ruleId: string;
 *   message: string;
 *   relativePath: string;
 *   line: number;
 *   column: number;
 *   snippet: string;
 * }} SpielwieseStyleViolation
 *
 * @typedef {{
 *   tokens: string[];
 *   sourceFile: ts.SourceFile;
 *   source: string;
 *   node: ts.Node;
 *   relativePath: string;
 *   violations: SpielwieseStyleViolation[];
 * }} EvaluateClassTokensArgs
 *
 * @typedef {{
 *   expression: ts.Expression;
 *   sourceFile: ts.SourceFile;
 *   source: string;
 *   relativePath: string;
 *   violations: SpielwieseStyleViolation[];
 * }} VisitClassValueArgs
 */

/**
 * @param {string} ruleId
 * @param {string} message
 * @param {string} relativePath
 * @param {number} line
 * @param {number} column
 * @param {string} snippet
 * @returns {SpielwieseStyleViolation}
 */
function reportRule(ruleId, message, relativePath, line, column, snippet) {
  return {
    ruleId,
    message,
    relativePath,
    line,
    column,
    snippet,
  };
}

/**
 * @param {string} targetPath
 * @returns {Promise<boolean>}
 */
async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} targetPath
 * @returns {Promise<string[]>}
 */
async function collectFiles(targetPath) {
  const targetStat = await stat(targetPath);

  if (targetStat.isFile()) {
    const extension = path.extname(targetPath);

    if (SOURCE_EXTENSIONS.has(extension) || STYLE_EXTENSIONS.has(extension)) {
      return [targetPath];
    }

    return [];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => collectFiles(path.join(targetPath, entry.name))),
  );

  return files.flat();
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {number} start
 * @returns {{ line: number; column: number }}
 */
function getLineAndColumn(sourceFile, start) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);

  return {
    line: line + 1,
    column: character + 1,
  };
}

/**
 * @param {string} source
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function getSnippet(source, start, end) {
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

/**
 * @param {string} token
 * @returns {string}
 */
function normalizeClassToken(token) {
  return token.trim();
}

/**
 * @param {ts.Node} node
 * @returns {node is ts.JsxAttribute}
 */
function isClassNameAttribute(node) {
  return (
    ts.isJsxAttribute(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "className"
  );
}

/**
 * @param {EvaluateClassTokensArgs} args
 * @returns {void}
 */
function evaluateClassTokens({
  tokens,
  sourceFile,
  source,
  node,
  relativePath,
  violations,
}) {
  for (const token of tokens) {
    const classToken = normalizeClassToken(token);

    if (classToken.length === 0) {
      continue;
    }

    const utility = classToken.split(":").at(-1) ?? classToken;
    const { line, column } = getLineAndColumn(sourceFile, node.getStart());
    const snippet = getSnippet(source, node.getStart(), node.getEnd());

    if (IMPORTANT_TAILWIND_PATTERN.test(classToken)) {
      violations.push(
        reportRule(
          "spielwiese/no-important",
          "Do not use !important in spielwiese. Fix selector scope, token usage, or component structure instead of forcing precedence.",
          relativePath,
          line,
          column,
          snippet,
        ),
      );
    }

    if (utility.startsWith("space-x-") || utility.startsWith("space-y-")) {
      violations.push(
        reportRule(
          "spielwiese/no-space-utilities",
          "Do not use space-x-* or space-y-* in spielwiese. Use gap-* on the parent instead.",
          relativePath,
          line,
          column,
          snippet,
        ),
      );
    }

    if (RAW_PALETTE_UTILITY_PATTERN.test(utility)) {
      violations.push(
        reportRule(
          "spielwiese/no-raw-palette-utilities",
          "Do not use raw Tailwind palette classes in spielwiese. Use semantic tokens like bg-background, text-foreground, border-border, or sidebar tokens instead.",
          relativePath,
          line,
          column,
          snippet,
        ),
      );
    }

    if (DARK_COLOR_OVERRIDE_PATTERN.test(classToken)) {
      violations.push(
        reportRule(
          "spielwiese/no-dark-color-overrides",
          "Do not fork color styling with dark: color utilities in spielwiese. Drive theme changes through scoped semantic tokens.",
          relativePath,
          line,
          column,
          snippet,
        ),
      );
    }
  }
}

/**
 * @param {VisitClassValueArgs} args
 * @returns {void}
 */
function visitClassValue({
  expression,
  sourceFile,
  source,
  relativePath,
  violations,
}) {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    evaluateClassTokens({
      tokens: expression.text.split(/\s+/),
      sourceFile,
      source,
      node: expression,
      relativePath,
      violations,
    });

    return;
  }

  if (ts.isTemplateExpression(expression)) {
    const tokens = [expression.head.text];

    for (const span of expression.templateSpans) {
      tokens.push(span.literal.text);
    }

    evaluateClassTokens({
      tokens: tokens.join(" ").split(/\s+/),
      sourceFile,
      source,
      node: expression,
      relativePath,
      violations,
    });

    return;
  }

  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    CLASSNAME_HELPERS.has(expression.expression.text)
  ) {
    for (const argument of expression.arguments) {
      visitClassValue({
        expression: argument,
        sourceFile,
        source,
        relativePath,
        violations,
      });
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} source
 * @returns {SpielwieseStyleViolation[]}
 */
function collectSourceViolations(filePath, source) {
  const relativePath = path.relative(process.cwd(), filePath);
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : filePath.endsWith(".ts")
      ? ts.ScriptKind.TS
      : filePath.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const violations = /** @type {SpielwieseStyleViolation[]} */ ([]);

  /**
   * @param {ts.Node} node
   * @returns {void}
   */
  function visit(node) {
    if (
      isClassNameAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression
    ) {
      visitClassValue({
        expression: node.initializer.expression,
        sourceFile,
        source,
        relativePath,
        violations,
      });
    }

    if (
      isClassNameAttribute(node) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      visitClassValue({
        expression: node.initializer,
        sourceFile,
        source,
        relativePath,
        violations,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return violations;
}

/**
 * @param {string} filePath
 * @param {string} source
 * @returns {SpielwieseStyleViolation[]}
 */
function collectStyleViolations(filePath, source) {
  const relativePath = path.relative(process.cwd(), filePath);
  const lines = source.split("\n");
  const violations = /** @type {SpielwieseStyleViolation[]} */ ([]);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const column = line.indexOf("!important");

    if (column !== -1) {
      violations.push(
        reportRule(
          "spielwiese/no-important",
          "Do not use !important in spielwiese. Fix selector scope, token usage, or component structure instead of forcing precedence.",
          relativePath,
          index + 1,
          column + 1,
          line.trim(),
        ),
      );
    }
  }

  return violations;
}

async function main() {
  const cwd = process.cwd();
  const existingTargets = /** @type {string[]} */ ([]);

  for (const target of TARGETS) {
    const absoluteTarget = path.join(cwd, target);

    if (await exists(absoluteTarget)) {
      existingTargets.push(absoluteTarget);
    }
  }

  if (existingTargets.length === 0) {
    process.exit(0);
  }

  const files = (
    await Promise.all(existingTargets.map((target) => collectFiles(target)))
  ).flat();

  const violations = /** @type {SpielwieseStyleViolation[]} */ ([]);

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const extension = path.extname(filePath);

    if (SOURCE_EXTENSIONS.has(extension)) {
      violations.push(...collectSourceViolations(filePath, source));
      continue;
    }

    if (STYLE_EXTENSIONS.has(extension)) {
      violations.push(...collectStyleViolations(filePath, source));
    }
  }

  if (violations.length === 0) {
    process.exit(0);
  }

  for (const violation of violations) {
    console.error(
      `${violation.ruleId}: ${violation.message}\n${violation.relativePath}:${violation.line}:${violation.column} ${violation.snippet}\n`,
    );
  }

  process.exit(1);
}

await main();
