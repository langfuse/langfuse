// File census for the structure stats: walks web/src and exposes lazy,
// memoized file contents and top-level export listings (TS compiler parse,
// no type checking).
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {typeof import("typescript")} */
const ts = require("typescript");

/** @typedef {import("./detectors.mjs").ExportEntry} ExportEntry */

/** @param {string} webRoot */
export function buildCensus(webRoot) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const dirs = [];
  /** @param {string} d */
  (function walk(d) {
    for (const e of readdirSync(`${webRoot}/${d}`, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) {
        dirs.push(p);
        walk(p);
      } else if (/\.[jt]sx?$/.test(e.name)) files.push(p);
    }
  })("src");

  /** @type {Map<string, string>} */
  const contents = new Map();
  /** @type {(p: string) => string} */
  const contentOf = (p) => {
    const cached = contents.get(p);
    if (cached !== undefined) return cached;
    const content = readFileSync(`${webRoot}/${p}`, "utf8");
    contents.set(p, content);
    return content;
  };

  /** @type {Map<string, ExportEntry[]>} */
  const exportCache = new Map();
  /** @type {(p: string) => ExportEntry[]} */
  const exportsOf = (p) => {
    const cached = exportCache.get(p);
    if (cached !== undefined) return cached;
    const sf = ts.createSourceFile(
      p,
      contentOf(p),
      ts.ScriptTarget.Latest,
      false,
      p.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    /** @type {ExportEntry[]} */
    const out = [];
    for (const st of sf.statements) {
      if (ts.isExportDeclaration(st)) {
        if (!st.exportClause) out.push({ name: "*", kind: "star" });
        else if (ts.isNamedExports(st.exportClause))
          for (const el of st.exportClause.elements)
            out.push({
              name: el.name.text,
              kind: st.isTypeOnly || el.isTypeOnly ? "type" : "reexport",
            });
        continue;
      }
      if (ts.isExportAssignment(st)) {
        out.push({ name: "(default)", kind: "value" });
        continue;
      }
      const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
      if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st))
        out.push({ name: st.name.text, kind: "type" });
      else if (
        ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isEnumDeclaration(st)
      )
        out.push({ name: st.name?.text ?? "(default)", kind: "value" });
      else if (ts.isVariableStatement(st))
        for (const decl of st.declarationList.declarations)
          if (ts.isIdentifier(decl.name))
            out.push({ name: decl.name.text, kind: "value" });
    }
    exportCache.set(p, out);
    return out;
  };

  return { files, dirs, contentOf, exportsOf };
}
