#!/usr/bin/env node
// structure:move — move files/folders and rewrite every importer, the way an
// IDE does: TypeScript's own LanguageService.getEditsForFileRename over
// web/tsconfig.json, so `@/src/...` aliases, extension-less specifiers, index
// resolution and literal dynamic import() are all handled by the compiler.
//
//   pnpm structure:move <from...> <to-dir>     move into a directory
//   pnpm structure:move <from> <to-file>       rename (one source, file target)
//
// Flags: --dry-run  --no-siblings  --no-verify  --no-color
//
// Booting the language service costs ~10-20s and every move after that is
// instant, which is why the CLI is batch-shaped.
//
// Invariants:
//   - move ≠ edit (RFC rule 15): moved files stay byte-identical; rewrites
//     land in importers only. A move that would edit a moved file aborts.
//   - history preserved: renames go through `git mv`.
//   - never destructive: on failure the revert command is printed, not run.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
/** @type {typeof import("@typescript/typescript6")} */
const ts = require("@typescript/typescript6");

/** @typedef {import("@typescript/typescript6").TextChange} TextChange */
/** @typedef {{ from: string, to: string, isDir: boolean, sibling: boolean }} Move */

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const invokedFrom = process.cwd();

// Source we may rewrite, and the extensions that mark a rename target. The
// edit set also offers tsconfig entries and generated `.next/types` decls.
const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

// A colocated sibling is `<stem>.<facet?>.<tag>.<ext>` next to `<stem>.<ext>`;
// the tag list is closed so that `index.ts` never drags `index.tsx` along.
const SIBLING_TAGS = [
  "clienttest",
  "servertest",
  "test",
  "spec",
  "stories",
  "fixtures",
  "module",
];

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2);
/** @type {(name: string) => boolean} */
const flag = (name) => args.includes(`--${name}`);
const positional = args.filter((a) => !a.startsWith("--"));
const dryRun = flag("dry-run");
const withSiblings = !flag("no-siblings");
const verify = !flag("no-verify");

const useColor =
  process.stdout.isTTY && !process.env.NO_COLOR && !flag("no-color");
/** @type {(code: string) => (s: string) => string} */
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : `${s}`);
const green = paint("32");
const red = paint("31");
const dim = paint("2");
const bold = paint("1");

if (positional.length < 2) {
  console.error(
    [
      "usage: pnpm structure:move <from...> <to-dir>     move into a directory",
      "       pnpm structure:move <from> <to-file>       rename in place",
      "",
      "  <from>     files and/or folders (web-relative, e.g. src/hooks/useFoo.ts)",
      "  <to-dir>   destination directory; created if missing",
      "  <to-file>  a target ending in a source extension renames instead:",
      "             src/f/fns/tree-building.ts src/f/fns/treeBuilding.ts",
      "",
      "  --dry-run      show the plan and the importer rewrites, change nothing",
      "  --no-siblings  do not carry <name>.{clienttest,stories,fixtures,...} along",
      "                 (flat next to the file, and under its __tests__/)",
      "  --no-verify    skip the closing tsc + structure:stats --diff",
    ].join("\n"),
  );
  process.exit(1);
}

// --- paths -------------------------------------------------------------------
/** Web-relative, forward-slashed. Accepts web-relative, repo-relative or absolute input. */
/** @type {(p: string) => string} */
function toWebRel(p) {
  const rel = relative(webRoot, resolve(invokedFrom, p)).replace(/\\/g, "/");
  if (rel.startsWith("..")) {
    console.error(`${red("outside web/:")} ${p}`);
    process.exit(1);
  }
  // `web/src/...` pasted while already inside web/ — there is no web/web
  if (rel.startsWith("web/") && !existsSync(abs("web"))) return rel.slice(4);
  return rel;
}
/** @type {(rel: string) => string} */
const abs = (rel) => `${webRoot}/${rel}`;
/** @type {(rel: string) => boolean} */
const isDirOnDisk = (rel) =>
  existsSync(abs(rel)) && statSync(abs(rel)).isDirectory();
/** "" for a file sitting directly in web/ — lastIndexOf alone would truncate it */
/** @type {(p: string) => string} */
const parentDir = (p) =>
  p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
/** @type {(p: string) => string} */
const baseName = (p) => p.slice(p.lastIndexOf("/") + 1);
/** Same trap as parentDir: an extension-less name must keep all of itself */
/** @type {(p: string) => string} */
const stemOf = (p) => (p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : p);
/** Web-relative join: a "" dir must not produce a leading slash, which git reads as absolute */
/** @type {(...parts: string[]) => string} */
const join = (...parts) => parts.filter(Boolean).join("/");

/** @type {(absDir: string) => string[]} */
function walkFiles(absDir) {
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const p = `${absDir}/${e.name}`;
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

// --- plan --------------------------------------------------------------------
// One source plus a target that names a file is a rename; anything else is a
// move into a directory. `getEditsForFileRename` does not care which it is.
const lastArg = toWebRel(
  /** @type {string} */ (positional[positional.length - 1]),
);
const fromArgs = positional.slice(0, -1).map(toWebRel);
const renameTo =
  fromArgs.length === 1 &&
  !isDirOnDisk(lastArg) &&
  SOURCE_EXT.some((e) => lastArg.endsWith(e))
    ? lastArg
    : null;
const toDir = renameTo ? parentDir(renameTo) : lastArg;

if (!renameTo && !isDirOnDisk(toDir) && existsSync(abs(toDir))) {
  console.error(`${red("destination is a file:")} ${toDir}`);
  process.exit(1);
}
// A rename target names a file, so a directory source would just produce a
// directory called `foo.ts` — git performs that happily. Directory renames are
// not in the surface (README): move the contents instead.
if (renameTo && isDirOnDisk(/** @type {string} */ (fromArgs[0]))) {
  console.error(
    `${red("directory rename:")} ${fromArgs[0]} is a directory, and ${renameTo} names a file — move the directory's contents to their new home instead`,
  );
  process.exit(1);
}

/** @type {Map<string, Move>} keyed by `from` */
const plan = new Map();
/** @type {(from: string, to: string, sibling: boolean) => void} */
function addMove(from, to, sibling) {
  if (plan.has(from)) return;
  plan.set(from, { from, to, isDir: isDirOnDisk(from), sibling });
}
/**
 * `<stem>.<facet?>.<tag>.<ext>`: a facet segment before the tag is normal here
 * (`PrettyJsonView.media.clienttest.tsx`) and rule 18 reads them the same way.
 * The nearest subject owns the file, so `Foo.bar.clienttest.tsx` belongs to
 * `Foo.bar.tsx` when that exists, not to `Foo.tsx`.
 */
/** @type {(dir: string, stem: string, entry: string) => boolean} */
function isSiblingOf(dir, stem, entry) {
  if (!entry.startsWith(`${stem}.`)) return false;
  const segments = entry.slice(stem.length + 1).split(".");
  segments.pop(); // the extension
  if (!segments.some((s) => SIBLING_TAGS.includes(s))) return false;
  let subject = stem;
  for (const segment of segments) {
    if (SIBLING_TAGS.includes(segment)) break;
    subject += `.${segment}`;
    if (SOURCE_EXT.some((e) => existsSync(abs(join(dir, subject + e)))))
      return false;
  }
  return true;
}

for (const from of fromArgs) {
  const to = renameTo ?? join(toDir, baseName(from));
  if (!existsSync(abs(from)) && !existsSync(abs(to))) {
    console.error(`${red("not found:")} ${from}`);
    process.exit(1);
  }
  addMove(from, to, false);
  if (!withSiblings || isDirOnDisk(from) || !existsSync(abs(from))) continue;
  const dir = parentDir(from);
  const base = baseName(from);
  const stem = stemOf(base);
  // a rename carries its siblings' stems along: Foo.clienttest.tsx -> Bar.clienttest.tsx
  const newBase = baseName(to);
  const newStem = stemOf(newBase);
  /** @type {(entry: string) => string} */
  const renamed = (entry) => newStem + entry.slice(stem.length);
  for (const entry of readdirSync(abs(dir)))
    if (isSiblingOf(dir, stem, entry))
      addMove(join(dir, entry), join(toDir, renamed(entry)), true);
  if (isDirOnDisk(join(dir, "__tests__")))
    // the subject a `__tests__/` entry belongs to still lives in `dir`
    for (const entry of readdirSync(abs(join(dir, "__tests__"))))
      if (isSiblingOf(dir, stem, entry))
        addMove(
          join(dir, "__tests__", entry),
          join(toDir, "__tests__", renamed(entry)),
          true,
        );
}

/** @type {(m: Move) => boolean} */
const isCaseOnly = (m) =>
  m.from !== m.to && m.from.toLowerCase() === m.to.toLowerCase();
/**
 * A case-insensitive filesystem reports a case-only rename's destination as
 * existing because it IS the source — same inode. On a case-sensitive one it is
 * a second, unrelated file, and overwriting it would be destructive, so only
 * the same-inode case may skip the conflict check.
 */
/** @type {(m: Move) => boolean} */
const isSelfCaseRename = (m) => {
  if (!isCaseOnly(m)) return false;
  try {
    const from = statSync(abs(m.from));
    const to = statSync(abs(m.to));
    return from.ino === to.ino && from.dev === to.dev;
  } catch {
    return false;
  }
};

/** @type {(msg: string) => never} */
function bail(msg) {
  console.error(msg);
  process.exit(1);
}
/** @type {Map<string, string>} destination -> the source that claimed it */
const claimed = new Map();
for (const m of plan.values()) {
  // two sources with one basename would both target the same path; git mv
  // refuses the second, and a rename fallback would silently clobber the first
  const already = claimed.get(m.to);
  if (already)
    bail(
      `${red("two sources, one destination:")} ${already} and ${m.from} both want ${m.to}`,
    );
  claimed.set(m.to, m.from);
  if (m.isDir && (toDir === m.from || toDir.startsWith(`${m.from}/`)))
    bail(
      `${red("destination is inside the source:")} ${toDir} is under ${m.from}`,
    );
  for (const other of plan.values())
    if (other !== m && other.isDir && m.from.startsWith(`${other.from}/`))
      bail(
        `${red("nested source:")} ${m.from} is already inside ${other.from}`,
      );
}

// --- idempotence + conflicts --------------------------------------------------
/** @type {Move[]} */
const pending = [];
/** @type {Move[]} */
const done = [];
for (const m of plan.values()) {
  if (!existsSync(abs(m.from))) {
    if (existsSync(abs(m.to))) done.push(m);
    else {
      console.error(`${red("not found:")} ${m.from}`);
      process.exit(1);
    }
    continue;
  }
  // a case-only rename looks like an existing destination on a
  // case-insensitive filesystem, but it is exactly the naming sweep's job
  if (existsSync(abs(m.to)) && !isSelfCaseRename(m)) {
    console.error(
      `${red("destination exists:")} ${m.to} (source ${m.from} is still there too)`,
    );
    process.exit(1);
  }
  pending.push(m);
}

const hasCaseOnly = pending.some(isCaseOnly);

if (!pending.length) {
  console.log(
    `${green("already applied")} — ${done.length} path${done.length === 1 ? "" : "s"} already at ${toDir}`,
  );
  process.exit(0);
}
if (done.length)
  console.log(
    dim(`${done.length} of ${plan.size} already at ${toDir} — moving the rest`),
  );

console.log(
  bold(renameTo ? `structure:move → ${renameTo}` : `structure:move → ${toDir}`),
);
for (const m of pending) {
  const destDir = parentDir(m.to);
  const note = !m.sibling
    ? ""
    : dim(`  (sibling${destDir === toDir ? "" : ` → ${destDir}/`})`);
  console.log(`  ${m.isDir ? "dir " : "file"} ${m.from}${note}`);
}
console.log();

// --- language service over a mutable in-memory layout ------------------------
const t0 = Date.now();
const parsed = ts.getParsedCommandLineOfConfigFile(
  `${webRoot}/tsconfig.json`,
  {},
  {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: ts.sys.readDirectory,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    getCurrentDirectory: () => webRoot,
    onUnRecoverableConfigFileDiagnostic: (dg) => {
      console.error(ts.flattenDiagnosticMessageText(dg.messageText, "\n"));
      process.exit(1);
    },
  },
);
if (!parsed) {
  console.error("could not read web/tsconfig.json");
  process.exit(1);
}

/** @type {(p: string) => string} */
const norm = (p) => p.replace(/\\/g, "/");
/** @type {Map<string, string>} in-memory content (edited or relocated) */
const overlay = new Map();
/** @type {Set<string>} paths the in-memory layout no longer has */
const removed = new Set();
/** @type {Map<string, number>} */
const versions = new Map();
/** @type {Set<string>} */
const scriptFileNames = new Set(parsed.fileNames.map(norm));
let projectVersion = 0;

/** @type {(p: string) => string | undefined} */
const currentText = (p) =>
  overlay.has(p)
    ? overlay.get(p)
    : removed.has(p)
      ? undefined
      : ts.sys.readFile(p);
/** @type {(p: string, text: string) => void} */
const setText = (p, text) => {
  overlay.set(p, text);
  removed.delete(p);
  versions.set(p, (versions.get(p) ?? 0) + 1);
  projectVersion++;
};
/** @type {(p: string) => void} */
const dropFile = (p) => {
  overlay.delete(p);
  removed.add(p);
  versions.set(p, (versions.get(p) ?? 0) + 1);
  projectVersion++;
};

/** @type {import("@typescript/typescript6").LanguageServiceHost} */
const lsHost = {
  getScriptFileNames: () => [...scriptFileNames],
  getScriptVersion: (f) => String(versions.get(norm(f)) ?? 0),
  getScriptSnapshot: (f) => {
    const text = currentText(norm(f));
    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
  },
  getProjectVersion: () => String(projectVersion),
  getCurrentDirectory: () => webRoot,
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  // a case-only rename is only a rename under case-sensitive comparison
  useCaseSensitiveFileNames: () =>
    hasCaseOnly || ts.sys.useCaseSensitiveFileNames,
  fileExists: (f) => {
    const p = norm(f);
    if (removed.has(p)) return false;
    return overlay.has(p) || ts.sys.fileExists(p);
  },
  readFile: (f, encoding) => {
    const p = norm(f);
    if (removed.has(p)) return undefined;
    return overlay.has(p) ? overlay.get(p) : ts.sys.readFile(p, encoding);
  },
  directoryExists: (d) => {
    const p = norm(d);
    if (ts.sys.directoryExists(p)) return true;
    for (const f of overlay.keys()) if (f.startsWith(`${p}/`)) return true;
    return false;
  },
  getDirectories: (d) => ts.sys.getDirectories(norm(d)),
  readDirectory: (path, extensions, exclude, include, depth) => {
    const dir = norm(path);
    const found = ts.sys
      .readDirectory(dir, extensions, exclude, include, depth)
      .map(norm)
      .filter((p) => !removed.has(p));
    for (const p of overlay.keys())
      if (
        p.startsWith(`${dir}/`) &&
        !found.includes(p) &&
        (!extensions || extensions.some((e) => p.endsWith(e)))
      )
        found.push(p);
    return found;
  },
  realpath: ts.sys.realpath,
};

const ls = ts.createLanguageService(lsHost, ts.createDocumentRegistry());
// force the first program build so the boot cost is paid (and visible) once
ls.getProgram();
console.log(
  dim(`language service ready (${((Date.now() - t0) / 1000).toFixed(1)}s)`),
);

// --- compute the rewrites ----------------------------------------------------
const formatOptions = ts.getDefaultFormatCodeSettings("\n");
/** @type {import("@typescript/typescript6").UserPreferences} */
const preferences = { quotePreference: "double" };

/** @type {Map<string, string>} moved-file new abs path -> its content before the batch */
const movedOriginal = new Map();
/** @type {Map<string, string>} old abs path -> new abs path, for every moved FILE */
const fileRenames = new Map();
/** @type {Map<string, string>} the inverse, for messages */
const oldPaths = new Map();
for (const m of pending) {
  const sources = m.isDir
    ? walkFiles(abs(m.from)).map(norm)
    : [norm(abs(m.from))];
  for (const src of sources) {
    const dest = norm(abs(m.to)) + src.slice(norm(abs(m.from)).length);
    fileRenames.set(src, dest);
    oldPaths.set(dest, src);
    const text = ts.sys.readFile(src);
    if (text !== undefined) movedOriginal.set(dest, text);
  }
}
/** @type {(dest: string) => string} */
const oldPathOf = (dest) => oldPaths.get(dest) ?? dest;

/** @type {(text: string, changes: readonly TextChange[]) => string} */
function applyChanges(text, changes) {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.span.start - a.span.start))
    out =
      out.slice(0, c.span.start) +
      c.newText +
      out.slice(c.span.start + c.span.length);
  return out;
}

/** @type {(p: string) => boolean} */
const isSource = (p) =>
  p.startsWith(`${webRoot}/`) &&
  !p.startsWith(`${webRoot}/.next`) &&
  !p.includes("/node_modules/") &&
  SOURCE_EXT.some((e) => p.endsWith(e));

/** @type {Set<string>} abs paths of importers we rewrote */
const touched = new Set();
for (const m of pending) {
  const oldAbs = norm(abs(m.from));
  const newAbs = norm(abs(m.to));
  for (const fc of ls.getEditsForFileRename(
    oldAbs,
    newAbs,
    formatOptions,
    preferences,
  )) {
    const target = norm(fc.fileName);
    const before = currentText(target);
    if (before === undefined || !isSource(target)) continue;
    setText(target, applyChanges(before, fc.textChanges));
    // a moved file already relocated by an earlier move in this batch is named
    // by its new path here — either way it is not an importer
    if (!fileRenames.has(target) && !movedOriginal.has(target))
      touched.add(target);
  }
  // reflect the new layout so the next move in the batch sees it
  for (const [src, dest] of fileRenames)
    if (src === oldAbs || src.startsWith(`${oldAbs}/`)) {
      const text = currentText(src);
      if (text !== undefined) setText(dest, text);
      dropFile(src);
      if (scriptFileNames.delete(src)) scriptFileNames.add(dest);
    }
}

// --- postcondition: move ≠ edit ---------------------------------------------
// A moved file may only change where the subtree it moved with is spelled
// differently from its new home (self-references written as `@/src/...`).
// Anything else — a link to something left behind, a non-specifier edit — is
// the compiler happily doing the wrong thing for us, so it aborts.
/** @type {(fileName: string, text: string) => { specifiers: string[], blanked: string }} */
function moduleSpecifiers(fileName, text) {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** @type {import("@typescript/typescript6").StringLiteralLike[]} */
  const nodes = [];
  /** @type {(n: import("@typescript/typescript6").Node) => void} */
  const visit = (n) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteralLike(n.moduleSpecifier)
    )
      nodes.push(n.moduleSpecifier);
    else if (
      ts.isImportTypeNode(n) &&
      ts.isLiteralTypeNode(n.argument) &&
      ts.isStringLiteralLike(n.argument.literal)
    )
      nodes.push(n.argument.literal);
    else if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === "require")) &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    )
      nodes.push(n.arguments[0]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  nodes.sort((a, b) => a.getStart(sf) - b.getStart(sf));
  let blanked = "";
  let cursor = 0;
  for (const node of nodes) {
    blanked += text.slice(cursor, node.getStart(sf)) + "\0";
    cursor = node.getEnd();
  }
  return {
    specifiers: nodes.map((n) => n.text),
    blanked: blanked + text.slice(cursor),
  };
}

/** @type {import("@typescript/typescript6").ModuleResolutionHost} */
const overlayResolutionHost = {
  fileExists: (f) => lsHost.fileExists(f),
  readFile: (f) => lsHost.readFile(f),
  directoryExists: (d) =>
    lsHost.directoryExists
      ? lsHost.directoryExists(d)
      : ts.sys.directoryExists(d),
  getCurrentDirectory: () => webRoot,
  getDirectories: (d) =>
    lsHost.getDirectories ? lsHost.getDirectories(d) : [],
  realpath: ts.sys.realpath,
  useCaseSensitiveFileNames: true,
};
const destinations = new Set(fileRenames.values());

/** @type {Map<string, string[]>} moved file -> "<old> → <new>" self-reference rewrites */
const followed = new Map();
/** @type {Map<string, string[]>} moved file -> rewrites that point outside the move */
const stranded = new Map();
for (const [dest, original] of movedOriginal) {
  const now = currentText(dest) ?? "";
  if (now === original) continue;
  const before = moduleSpecifiers(dest, original);
  const after = moduleSpecifiers(dest, now);
  if (
    before.blanked !== after.blanked ||
    before.specifiers.length !== after.specifiers.length
  ) {
    stranded.set(dest, ["(edit outside a module specifier)"]);
    continue;
  }
  for (const [i, spec] of after.specifiers.entries()) {
    if (spec === before.specifiers[i]) continue;
    const resolved = ts.resolveModuleName(
      spec,
      dest,
      parsed.options,
      overlayResolutionHost,
    ).resolvedModule?.resolvedFileName;
    const bucket =
      resolved && destinations.has(norm(resolved)) ? followed : stranded;
    bucket.set(dest, [
      ...(bucket.get(dest) ?? []),
      `${before.specifiers[i]} → ${spec}`,
    ]);
  }
}

if (stranded.size) {
  console.error(
    red(
      "aborted: this move would edit the moved files (RFC rule 15: move ≠ edit).",
    ),
  );
  for (const [dest, rewrites] of stranded) {
    console.error(`\n  ${relative(webRoot, oldPathOf(dest))}`);
    for (const r of rewrites) console.error(`    ${r}`);
  }
  console.error(
    "\nThose point at something left behind. Move it too, or do this one by hand.",
  );
  process.exit(1);
}
// --- report ------------------------------------------------------------------
const importerFiles = [...touched].sort();
console.log(
  `${importerFiles.length} importer${importerFiles.length === 1 ? "" : "s"} to rewrite`,
);
for (const f of importerFiles) {
  console.log(
    dryRun ? `  ${relative(webRoot, f)}` : dim(`  ${relative(webRoot, f)}`),
  );
  if (!dryRun) continue;
  const was = moduleSpecifiers(f, ts.sys.readFile(f) ?? "").specifiers;
  for (const [i, spec] of moduleSpecifiers(
    f,
    currentText(f) ?? "",
  ).specifiers.entries())
    if (was[i] !== spec)
      console.log(`    ${red(was[i] ?? "")} → ${green(spec)}`);
}
if (followed.size) {
  const n = [...followed.values()].reduce((a, r) => a + r.length, 0);
  console.log(
    `${followed.size} moved file${followed.size === 1 ? "" : "s"} respelling ${n} alias self-reference${n === 1 ? "" : "s"} into the subtree ${dim("(they encode the old path)")}`,
  );
  if (dryRun)
    for (const [dest, rewrites] of followed) {
      console.log(`  ${relative(webRoot, oldPathOf(dest))}`);
      for (const r of rewrites) console.log(dim(`    ${r}`));
    }
}

/** @type {(cmd: string, cmdArgs: string[]) => string} */
const git = (cmd, cmdArgs) =>
  execFileSync("git", [cmd, ...cmdArgs], { cwd: webRoot, encoding: "utf8" });

// Rewriting a file that already has uncommitted work in it also runs prettier
// over that work — worth saying out loud before it happens.
if (importerFiles.length) {
  const rels = importerFiles.map((f) => relative(webRoot, f));
  const dirty = git("status", ["--porcelain", "--", ...rels])
    .split("\n")
    .filter(Boolean);
  if (dirty.length) {
    console.log(
      red(
        `${dirty.length} file${dirty.length === 1 ? "" : "s"} to rewrite already ha${dirty.length === 1 ? "s" : "ve"} uncommitted changes:`,
      ),
    );
    for (const line of dirty) console.log(`  ${line}`);
  }
}

if (dryRun) {
  console.log();
  console.log(dim("dry run — nothing written. Drop --dry-run to apply."));
  process.exit(0);
}

// --- apply -------------------------------------------------------------------
// The way back out of any state this can reach is the inverse move, so print
// that rather than a reset — including when the apply itself dies halfway.
/** @type {(moves: Move[]) => void} */
function printRevert(moves) {
  if (!moves.length) return;
  console.log();
  console.log(dim("revert:"));
  // a renamed file's inverse is a rename, not a move into its old directory —
  // that would just report the destination as already occupied
  /** @type {Map<string, string[]>} original parent dir -> new paths that came from it */
  const byParent = new Map();
  for (const m of moves) {
    if (baseName(m.from) !== baseName(m.to)) {
      console.log(dim(`  pnpm structure:move ${m.to} ${m.from}`));
      continue;
    }
    const parent = parentDir(m.from) || ".";
    byParent.set(parent, [...(byParent.get(parent) ?? []), m.to]);
  }
  for (const [parent, tos] of byParent)
    console.log(dim(`  pnpm structure:move ${tos.join(" ")} ${parent}`));
}

/** @type {Move[]} */
const appliedMoves = [];
try {
  for (const m of pending) {
    mkdirSync(abs(parentDir(m.to)), { recursive: true });
    try {
      git("mv", isCaseOnly(m) ? ["-f", m.from, m.to] : [m.from, m.to]);
    } catch (err) {
      // git mv also refuses an untracked source; a plain rename is equivalent
      // there, but only ever onto a destination that does not exist — rename(2)
      // would overwrite one silently.
      if (existsSync(abs(m.to)) && !isSelfCaseRename(m)) throw err;
      renameSync(abs(m.from), abs(m.to));
      git("add", ["--", m.to]);
    }
    appliedMoves.push(m);
  }
  // git does not track directories, so a move that empties one leaves it on
  // disk. rmdir only ever succeeds on an empty one, so this cannot lose work.
  for (const m of pending) {
    let dir = parentDir(m.from);
    while (dir.startsWith("src/") && dir !== "src") {
      try {
        rmdirSync(abs(dir));
      } catch {
        break;
      }
      dir = parentDir(dir);
    }
  }
  const rewritten = [...new Set([...importerFiles, ...followed.keys()])];
  for (const f of rewritten) writeFileSync(f, currentText(f) ?? "", "utf8");
  if (rewritten.length)
    // a specifier gets longer or shorter, so prettier may want to re-wrap the line
    execFileSync(
      "pnpm",
      [
        "exec",
        "prettier",
        "--write",
        "--log-level",
        "warn",
        ...rewritten.map((f) => relative(webRoot, f)),
      ],
      { cwd: webRoot, stdio: "inherit" },
    );
  // A moved file's respelled self-reference IS staged: `git mv` already put its
  // pre-edit bytes in the index, so leaving it out would stage a rename whose
  // content imports a path this same move deleted. Importer rewrites stay
  // unstaged — those files can carry unrelated work that is not ours to commit.
  if (followed.size)
    git("add", [
      "--",
      ...[...followed.keys()].map((f) => relative(webRoot, f)),
    ]);
} catch (err) {
  console.error(
    red(`\napply failed: ${err instanceof Error ? err.message : String(err)}`),
  );
  printRevert(appliedMoves);
  process.exit(1);
}
console.log();
console.log(
  `${green("moved")} ${pending.length} path${pending.length === 1 ? "" : "s"} → ${toDir}, rewrote ${importerFiles.length} importer${importerFiles.length === 1 ? "" : "s"}`,
);

// --- the blind spot + the way back -------------------------------------------
// Modules named by string (vi.mock, worker URLs, route strings) are invisible
// to the compiler, so tsc stays green while they dangle. We can't rewrite them
// safely, but we can refuse to let them pass unseen.
const HIT_LIMIT = 30;
/** @type {string[]} */
const dangling = [];
for (const m of pending) {
  const needle = m.isDir ? m.from : stemOf(m.from);
  try {
    const out = execFileSync(
      "git",
      [
        "grep",
        "-nF",
        needle,
        "--",
        ":(exclude)web/.structure-baseline.json",
        ":(exclude)*.lock",
        ":(exclude)pnpm-lock.yaml",
      ],
      { cwd: resolve(webRoot, ".."), encoding: "utf8" },
    );
    dangling.push(...out.trimEnd().split("\n"));
  } catch {
    // git grep exits 1 with no matches
  }
}
console.log();
if (dangling.length) {
  console.log(
    red(
      `${dangling.length} reference${dangling.length === 1 ? "" : "s"} to the old path survive as strings — tsc cannot see these:`,
    ),
  );
  for (const line of dangling.slice(0, HIT_LIMIT)) console.log(`  ${line}`);
  if (dangling.length > HIT_LIMIT)
    console.log(dim(`  … ${dangling.length - HIT_LIMIT} more`));
  console.log(dim("Fix them by hand (vi.mock paths, worker URLs, docs)."));
} else {
  console.log(dim("no string references to the old path survive."));
}

printRevert(pending);

// --- verify ------------------------------------------------------------------
if (!verify) process.exit(0);
console.log();
console.log(bold("tsc --noEmit"));
try {
  execFileSync("pnpm", ["run", "typecheck"], {
    cwd: webRoot,
    stdio: "inherit",
  });
} catch {
  console.error(
    red(
      "\ntypecheck failed — the move is on disk; revert with the command above.",
    ),
  );
  process.exit(1);
}
console.log(bold("\nstructure:stats --diff"));
execFileSync("node", ["scripts/structure/stats.mjs", "--diff"], {
  cwd: webRoot,
  stdio: "inherit",
});
