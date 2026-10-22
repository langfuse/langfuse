import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "worker/package.json"));
const ts = require("typescript");
const { ESLint } = require("eslint");
const configRequire = createRequire(
  resolve(root, "packages/config-eslint/package.json"),
);
const tseslint = configRequire("typescript-eslint");
const rule = "@typescript-eslint/no-use-before-define";
const suppression = /^\/\* eslint-disable ([^\n]*?) \*\/\r?\n/;

export function removeSuppression(text) {
  const match = text.match(suppression);
  if (!match) return text;
  const rules = match[1].split(",").map((name) => name.trim());
  if (!rules.includes(rule)) return text;
  const remaining = rules.filter((name) => name !== rule);
  return (
    (remaining.length ? `/* eslint-disable ${remaining.join(", ")} */\n` : "") +
    text.slice(match[0].length)
  );
}

export function auditMoves(original, changed, filePath) {
  const parse = (text) =>
    ts.createSourceFile(
      filePath,
      removeSuppression(text),
      ts.ScriptTarget.Latest,
      true,
    );
  const before = parse(original);
  const after = parse(changed);
  const chunks = (source) =>
    source.statements.map((statement) =>
      source.text.slice(statement.getFullStart(), statement.end).trim(),
    );
  if (
    before.statements.some(
      (statement) => ts.isFunctionDeclaration(statement) && !statement.body,
    ) &&
    JSON.stringify(chunks(before)) !== JSON.stringify(chunks(after))
  ) {
    return "file contains overload or ambient function declarations";
  }
  // Includes attached comments: no body, initializer, import, or documentation edits.
  if (
    JSON.stringify(chunks(before).sort()) !==
    JSON.stringify(chunks(after).sort())
  ) {
    return "statement text or attached comments changed";
  }
  const runtime = (source) =>
    source.statements
      .filter(
        (statement) =>
          !ts.isFunctionDeclaration(statement) &&
          !ts.isTypeAliasDeclaration(statement) &&
          !ts.isInterfaceDeclaration(statement),
      )
      .map((statement) => statement.getText(source));
  if (JSON.stringify(runtime(before)) !== JSON.stringify(runtime(after))) {
    return "runtime statement order changed";
  }
}

// Parse and bind once. Runtime statements retain their original relative order.
export async function fixSource(original, filePath, lint) {
  const text = removeSuppression(original);
  if (text === original)
    return { reason: "no supported file-level suppression" };
  const messages = await lint(text, filePath);
  if (messages.some((message) => message.fatal || message.ruleId === null)) {
    return { reason: "parse error, ignored file, or configuration diagnostic" };
  }
  const violations = messages.filter((message) => message.ruleId === rule);
  if (!violations.length) return { text };

  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  if (
    source.statements.some(
      (statement) => ts.isFunctionDeclaration(statement) && !statement.body,
    )
  ) {
    return {
      reason: "file contains overload or ambient function declarations",
    };
  }
  const host = {
    getSourceFile: (name) => (name === filePath ? source : undefined),
    getDefaultLibFileName: () => "",
    writeFile: () => {},
    getCurrentDirectory: () => root,
    getDirectories: () => [],
    fileExists: (name) => name === filePath,
    readFile: (name) => (name === filePath ? text : undefined),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
  const program = ts.createProgram(
    [filePath],
    { noLib: true, noResolve: true },
    host,
  );
  const checker = program.getTypeChecker();
  for (const violation of violations) {
    const position = source.getPositionOfLineAndCharacter(
      violation.line - 1,
      violation.column - 1,
    );
    let identifier;
    function visit(node) {
      if (position < node.getStart(source) || position >= node.end) return;
      if (ts.isIdentifier(node)) identifier = node;
      ts.forEachChild(node, visit);
    }
    visit(source);
    const symbol = identifier && checker.getSymbolAtLocation(identifier);
    const declarations = symbol?.getDeclarations() ?? [];
    if (declarations.length !== 1) {
      return {
        reason: "unresolved, merged, duplicate, or overloaded declaration",
      };
    }
    const declaration = declarations[0];
    const movable =
      (ts.isFunctionDeclaration(declaration) && declaration.body) ||
      ts.isTypeAliasDeclaration(declaration) ||
      ts.isInterfaceDeclaration(declaration);
    if (!movable || declaration.parent !== source) {
      return {
        reason: `line ${violation.line}: not an ordinary top-level function or type declaration`,
      };
    }
    let statement = identifier;
    while (statement && statement.parent !== source)
      statement = statement.parent;
    if (
      !statement ||
      statement.getStart(source) >= declaration.getStart(source)
    ) {
      return { reason: "not a forward reference between top-level statements" };
    }
  }

  const headerEnd = text.match(suppression)?.[0].length ?? 0;
  if (
    /[@#]ts-|eslint-|prettier-ignore|sourceMappingURL/.test(
      text.slice(headerEnd),
    )
  ) {
    return { reason: "comment directive in reordered file" };
  }
  const statements = [...source.statements];
  const dependencies = new Map(
    statements.map((statement) => [statement, new Set()]),
  );
  for (const statement of statements) {
    function visit(node) {
      if (ts.isIdentifier(node)) {
        for (const declaration of checker
          .getSymbolAtLocation(node)
          ?.getDeclarations() ?? []) {
          let owner = declaration;
          while (owner.parent && owner.parent !== source) owner = owner.parent;
          if (owner !== statement && dependencies.has(owner)) {
            dependencies.get(statement).add(owner);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(statement);
  }
  const emitted = new Set();
  const visiting = new Set();
  const ordered = [];
  function emit(statement, moving = false) {
    if (emitted.has(statement)) return;
    if (visiting.has(statement)) throw new Error("dependency cycle");
    if (moving) {
      const movable =
        (ts.isFunctionDeclaration(statement) && statement.body) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement);
      const declarations =
        statement.name &&
        checker.getSymbolAtLocation(statement.name)?.getDeclarations();
      if (!movable || declarations?.length !== 1) {
        throw new Error(
          "dependency requires moving a runtime, merged, or overloaded declaration",
        );
      }
    }
    visiting.add(statement);
    for (const dependency of dependencies.get(statement))
      emit(dependency, true);
    visiting.delete(statement);
    emitted.add(statement);
    ordered.push(statement);
  }
  try {
    for (const statement of statements) emit(statement);
  } catch (error) {
    return { reason: error.message };
  }
  const result =
    text.slice(0, headerEnd) +
    ordered
      .map((statement, index) => {
        const chunk = text.slice(
          Math.max(headerEnd, statement.getFullStart()),
          statement.end,
        );
        return index > 0 && !/^\s/.test(chunk) ? `\n\n${chunk}` : chunk;
      })
      .join("") +
    text.slice(statements.at(-1)?.end ?? headerEnd);
  const audit = auditMoves(original, result, filePath);
  if (audit) return { reason: audit };
  const remaining = await lint(result, filePath);
  if (
    remaining.some(
      (message) =>
        message.fatal || message.ruleId === null || message.ruleId === rule,
    )
  ) {
    return { reason: "post-transform lint did not pass" };
  }
  return { text: result };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => !["--write", "--check"].includes(arg)) ||
    args.length > 1
  ) {
    throw new Error(
      "Usage: node scripts/fix-no-use-before-define.mjs [--write | --check]",
    );
  }
  const write = args.includes("--write");
  const check = args.includes("--check");
  const files = execFileSync(
    "git",
    [
      "ls-files",
      ...(check ? ["-m"] : []),
      "-z",
      "--",
      "*.ts",
      "*.tsx",
      "*.mts",
      "*.cts",
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
  // This rule needs scope analysis, not project-wide type information.
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx,mts,cts}"],
        linterOptions: { reportUnusedDisableDirectives: "off" },
        languageOptions: { parser: tseslint.parser },
        plugins: { "@typescript-eslint": tseslint.plugin },
        rules: { [rule]: "error" },
      },
    ],
  });
  let fixed = 0;
  let skipped = 0;
  for (const file of files) {
    const filePath = resolve(root, file);
    const original = await readFile(filePath, "utf8");
    if (check) {
      const baseline = execFileSync("git", ["show", `HEAD:${file}`], {
        cwd: root,
        encoding: "utf8",
      });
      const audit = auditMoves(baseline, original, filePath);
      const [result] = await eslint.lintText(original, { filePath });
      const violations = result.messages.filter(
        (message) => message.fatal || message.ruleId === rule,
      );
      if (audit || violations.length) {
        console.log(
          `FAIL ${file}: ${audit ?? `${violations.length} lint violations`}`,
        );
        process.exitCode = 1;
      }
      fixed++;
      continue;
    }
    if (removeSuppression(original) === original) continue;
    const result = await fixSource(original, filePath, async (text, path) => {
      const [result] = await eslint.lintText(text, { filePath: path });
      if (!result) return [{ fatal: true }];
      return result.messages;
    });
    if (!result.text) {
      skipped++;
      console.log(`SKIP ${file}: ${result.reason}`);
      continue;
    }
    fixed++;
    if (write) await writeFile(filePath, result.text);
    console.log(`${write ? "FIX" : "WOULD FIX"} ${file}`);
  }
  console.log(
    `${fixed} ${check ? "audited" : write ? "fixed" : "fixable"}, ${skipped} skipped${write || check ? "" : " (dry run; use --write to apply)"}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
