// Batch relocation preserves module targets while changing their filesystem paths.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("@typescript/typescript6");
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** @typedef {{from: string, to: string}} Move */
/** @param {string} path */
const posix = (path) => path.split(sep).join("/");

/** @param {string} path @param {Move[]} moves */
export function relocatePath(path, moves) {
  const move = [...moves]
    .sort((a, b) => b.from.length - a.from.length)
    .find(({ from }) => path === from || path.startsWith(`${from}/`));
  return move ? move.to + path.slice(move.from.length) : path;
}

/** @param {string} file @param {string} text @param {Move[]} moves */
export function rewriteStyleReferences(file, text, moves) {
  const newFile = relocatePath(file, moves);
  return text.replace(
    /(@(?:reference|import|source)\s+|source\()(["'])(\.{1,2}(?:\/[^"']*)?)\2/g,
    (_match, prefix, quote, value) => {
      const target = posix(
        relative(webRoot, resolve(webRoot, dirname(file), value)),
      );
      const newTarget = relocatePath(target, moves);
      const rel = posix(
        relative(
          dirname(resolve(webRoot, newFile)),
          resolve(webRoot, newTarget),
        ),
      );
      return prefix + quote + (rel.startsWith(".") ? rel : `./${rel}`) + quote;
    },
  );
}

/** Import/export, mock, worker URL and configuration literals use the same path map. */
/** @param {string} file @param {string} text @param {Move[]} moves @param {import('@typescript/typescript6').CompilerOptions} options @param {import('@typescript/typescript6').ModuleResolutionHost} host */
export function rewriteReferences(file, text, moves, options, host = ts.sys) {
  const newFile = relocatePath(file, moves);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const fontFactories = new Set(
    source.statements
      .filter(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.getText(source).includes("next/font/local"),
      )
      .map((statement) =>
        ts.isImportDeclaration(statement)
          ? statement.importClause?.name?.text
          : undefined,
      )
      .filter(Boolean),
  );
  /** @param {import('@typescript/typescript6').StringLiteralLike} node */
  const isRelativeReference = (node) => {
    const parent = node.parent;
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent))
      return true;
    if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent))
      return true;
    if (ts.isCallExpression(parent)) {
      const expression = parent.expression;
      if (
        expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(expression) && expression.text === "require")
      )
        return true;
      if (
        ts.isPropertyAccessExpression(expression) &&
        ["mock", "doMock", "importActual", "importMock"].includes(
          expression.name.text,
        )
      )
        return true;
      if (/import\.meta\.(dirname|url)|__dirname/.test(parent.getText(source)))
        return true;
    }
    if (
      ts.isNewExpression(parent) &&
      parent.expression.getText(source) === "URL" &&
      parent.getText(source).includes("import.meta.url")
    )
      return true;
    for (
      let ancestor = node.parent;
      ancestor && !ts.isStatement(ancestor);
      ancestor = ancestor.parent
    ) {
      if (
        ts.isCallExpression(ancestor) &&
        ts.isIdentifier(ancestor.expression) &&
        fontFactories.has(ancestor.expression.text)
      )
        return true;
    }
    // Build configuration uses relative directory/glob literals rather than imports.
    return (
      !file.startsWith("src/") &&
      !file.startsWith("pages/") &&
      !file.startsWith("app/")
    );
  };
  /** @type {{start: number, end: number, text: string}[]} */
  const edits = [];
  /** Resolve extensionless imports when a plan moves an individual source file. */
  /** @param {string} value @param {string} target */
  const relocateReference = (value, target) => {
    const direct = relocatePath(target, moves);
    if (direct !== target) return direct;
    const resolved = ts.resolveModuleName(
      value,
      resolve(webRoot, file),
      options,
      host,
    ).resolvedModule;
    if (!resolved) return target;
    const resolvedPath = posix(relative(webRoot, resolved.resolvedFileName));
    let moved = relocatePath(resolvedPath, moves);
    if (moved === resolvedPath) return target;
    // Keep the caller's extension and directory-index import convention.
    const extension = /(?:\.d)?\.[cm]?[jt]sx?$/.exec(resolvedPath)?.[0];
    if (extension && !value.endsWith(extension)) {
      const importExtension = /\.[cm]?[jt]sx?$/.exec(value)?.[0] ?? "";
      moved = moved.slice(0, -extension.length) + importExtension;
      if (resolvedPath === `${target}/index${extension}`)
        moved = moved.replace(/\/index$/, "");
    }
    return moved;
  };
  /** @param {import('@typescript/typescript6').Node} node */
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) {
      const value = node.text;
      let rewritten = value;
      if (value.startsWith("@/")) {
        rewritten = "@/" + relocateReference(value, value.slice(2));
      } else if (value.startsWith("src/")) {
        rewritten = relocatePath(value, moves);
      } else if (value.startsWith("/src/")) {
        rewritten = "/" + relocatePath(value.slice(1), moves);
      } else if (
        (value.startsWith("./") || value.startsWith("../")) &&
        isRelativeReference(node)
      ) {
        const target = posix(
          relative(webRoot, resolve(webRoot, dirname(file), value)),
        );
        const resolved = ts.resolveModuleName(
          value,
          resolve(webRoot, file),
          options,
          host,
        ).resolvedModule;
        // Globs and CSS/assets can have no TypeScript module resolution.
        const movedTarget = relocateReference(value, target);
        if (
          resolved ||
          host.fileExists(resolve(webRoot, target)) ||
          host.directoryExists?.(resolve(webRoot, target)) ||
          movedTarget !== target
        ) {
          const newTarget = movedTarget;
          const rel = posix(
            relative(
              dirname(resolve(webRoot, newFile)),
              resolve(webRoot, newTarget),
            ),
          );
          rewritten = rel.startsWith(".") ? rel : `./${rel}`;
        }
      }
      if (rewritten !== value) {
        const start = node.getStart(source) + 1;
        edits.push({ start, end: node.getEnd() - 1, text: rewritten });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}

/** @param {string} planPath @param {string[]} args */
export function runRelocation(planPath, args) {
  const plan = JSON.parse(
    readFileSync(resolve(process.cwd(), planPath), "utf8"),
  );
  const moves = plan.moves;
  const repoRoot = resolve(webRoot, "..");
  const resume = args.includes("--resume");
  const tracked = execFileSync(
    "git",
    resume
      ? ["ls-tree", "-r", "--name-only", "-z", "HEAD"]
      : ["ls-files", "-z"],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const sourceFiles = tracked.filter(
    (file) => file.startsWith("web/") && /(?:\.[cm]?[jt]sx?|\.css)$/.test(file),
  );
  const destinations = new Map();
  const renames = tracked
    .filter((file) => file.startsWith("web/"))
    .map((file) => {
      const from = file.slice(4);
      return { from, to: relocatePath(from, moves) };
    })
    .filter(({ from, to }) => from !== to);
  for (const { from, to } of renames) {
    if (destinations.has(to)) throw new Error(`Two sources target ${to}`);
    if (
      existsSync(resolve(webRoot, to)) &&
      (!resume || existsSync(resolve(webRoot, from)))
    )
      throw new Error(`Destination exists: ${to}`);
    destinations.set(to, from);
    if (from.startsWith("src/ee/") && !to.startsWith("src/ee/"))
      throw new Error(`Enterprise source cannot leave src/ee: ${from}`);
  }
  const config = ts.readConfigFile(
    resolve(webRoot, "tsconfig.json"),
    ts.sys.readFile,
  );
  const { options } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    webRoot,
  );
  const rewrites = [];
  for (const file of resume ? [] : sourceFiles) {
    const old = readFileSync(resolve(repoRoot, file), "utf8");
    const text = file.endsWith(".css")
      ? rewriteStyleReferences(file.slice(4), old, moves)
      : rewriteReferences(file.slice(4), old, moves, options);
    if (text !== old) rewrites.push({ file, text });
  }
  console.log(
    `Relocation plan: ${renames.length} files, ${rewrites.length} reference rewrites`,
  );
  if (args.includes("--dry-run")) return;
  // Rewrites are computed before mutation, including moved modules and literal mocks.
  for (const { file, text } of rewrites)
    writeFileSync(resolve(repoRoot, file), text);
  for (const { from, to } of renames) {
    if (
      resume &&
      !existsSync(resolve(webRoot, from)) &&
      existsSync(resolve(webRoot, to))
    )
      continue;
    mkdirSync(dirname(resolve(webRoot, to)), { recursive: true });
    for (let attempt = 0; ; attempt++) {
      try {
        execFileSync("git", ["mv", "--", from, to], {
          cwd: webRoot,
          stdio: "pipe",
        });
        break;
      } catch (error) {
        if (
          attempt >= 20 ||
          !(error instanceof Error) ||
          !("stderr" in error) ||
          !String(error.stderr).includes("index.lock")
        )
          throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    }
  }
  console.log(`Relocation complete: ${renames.length} git renames`);
}
