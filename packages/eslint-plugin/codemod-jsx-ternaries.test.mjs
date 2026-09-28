import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { transform } from "./codemod-jsx-ternaries.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function checked(source, useLib = false) {
  const file = "/virtual/example.tsx";
  const options = { jsx: ts.JsxEmit.Preserve, noLib: !useLib };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  host.getSourceFile = (name) =>
    name === file
      ? ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        )
      : getSourceFile(name);
  host.fileExists = (name) => name === file || fileExists(name);
  host.readFile = (name) => (name === file ? source : readFile(name));
  const program = ts.createProgram([file], options, host);
  return transform(source, file, {
    checker: program.getTypeChecker(),
    sourceFile: program.getSourceFile(file),
  });
}

test("splits a safe nested true branch into JSX siblings", () => {
  const source =
    "const view = <div>{a === 1 ? b === 2 ? 'one' : 'two' : 'three'}</div>";
  const { output, changed } = transform(source);
  assert.equal(changed, 1);
  assert.match(output, /\{!!\(a === 1\) && !!\(b === 2\) && \('one'\)\}/);
  assert.match(output, /\{!!\(a === 1\) && !\(b === 2\) && \('two'\)\}/);
  assert.match(output, /\{!\(a === 1\) && \('three'\)\}/);
  assert.equal(transform(output).changed, 0);
});

test("splits a safe nested false branch", () => {
  const result = transform(
    "const view = <>{a === 1 ? 'one' : b === 2 ? 'two' : 'three'}</>",
  );
  assert.equal(result.changed, 1);
  assert.match(result.output, /!\(a === 1\) && !!\(b === 2\)/);
});

test("accepts stable boolean and number identifiers but rejects unknowns", () => {
  const boolean = checked(
    "declare const a: boolean; declare const b: boolean; const view = <div>{a ? b ? 1 : 2 : 3}</div>",
  );
  assert.equal(boolean.changed, 1);
  assert.match(boolean.output, /\{!!\(a\) && !!\(b\) && \(1\)\}/);

  const number = checked(
    "declare const a: number; declare const b: boolean; const view = <div>{a ? b ? 1 : 2 : 3}</div>",
  );
  assert.equal(number.changed, 1);
  assert.match(number.output, /!!\(a\)/);
  const unknown = checked(
    "declare const a: unknown; declare const b: boolean; const view = <div>{a ? b ? 1 : 2 : 3}</div>",
  );
  assert.equal(unknown.changed, 0);
  const effects = checked(
    "declare const a: boolean; declare const b: boolean; declare function run(): number; const view = <div>{a ? b ? run() : 2 : 3}</div>",
  );
  assert.equal(effects.changed, 1);
});

test("coerces stable truthy conditions without eagerly evaluating branches", () => {
  const source =
    "const logoLight: string | undefined = ''; const logoDark: string | undefined = 'dark'; const view = <div>{logoLight && logoDark ? run() : logoLight ? 'light' : 'none'}</div>";
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.match(result.output, /!!\(logoLight && logoDark\) && \(run\(\)\)/);
  assert.match(result.output, /!\(logoLight && logoDark\) && !!\(logoLight\)/);
});

test("rejects reassigned parameters and mutable locals with dynamic branches", () => {
  const reassigned = checked(
    "function view(a: string, b: boolean) { a = 'new'; return <div>{a ? b ? run() : 2 : 3}</div> }",
  );
  assert.equal(reassigned.changed, 0);
  const mutable = checked(
    "let a = ''; const b = true; const view = <div>{a ? b ? run() : 2 : 3}</div>",
  );
  assert.equal(mutable.changed, 0);
});

test("preserves comments before JSX branches and comments within JSX", () => {
  const source = `const light: string | undefined = 'light';
const dark: string | undefined = 'dark';
const view = <div>{light && dark ? (
  // Keep this with the first branch.
  <><img src={light} />{/* eslint-disable-next-line example/rule */}<span>logo</span></>
) : dark ? <span>dark</span> : <span>none</span>}</div>`;
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.equal(
    result.output.match(/Keep this with the first branch/g)?.length,
    1,
  );
  assert.equal(result.output.match(/eslint-disable-next-line/g)?.length, 1);
  assert.match(result.output, /\/\/ Keep this with the first branch\.\n\s*<>/);
  assert.equal(checked(result.output).changed, 0);
});

test("preserves consecutive line comments with a destructured parameter guard", () => {
  const source = `function View({ variant }: { variant: 'icon' | 'wordmark' }) {
  const logo: string | undefined = 'light';
  return <div>{logo ? (
    // First explanation.
    // Second explanation.
    <><span>{logo}</span>{/* eslint-disable-next-line example/rule */}<img src={logo} /></>
  ) : variant === 'wordmark' ? <span>wordmark</span> : <span>icon</span>}</div>;
}`;
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.equal(result.output.match(/First explanation/g)?.length, 1);
  assert.equal(result.output.match(/Second explanation/g)?.length, 1);
  assert.equal(result.output.match(/eslint-disable-next-line/g)?.length, 1);
});

test("skips comments whose branch placement is ambiguous", () => {
  const source =
    "const view = <div>{a === 1 ? 'one' /* trailing */ : b === 2 ? 'two' : 'three'}</div>";
  const result = transform(source);
  assert.equal(result.changed, 0);
  assert.equal(result.output, source);
});

test("keeps comments before alternate branches with the alternate", () => {
  const source = `const view = <div>{a === 1 ? 'one' : (
    // Alternate branch
    b === 2 ? 'two' : 'three'
  )}</div>`;
  const result = transform(source);
  assert.equal(result.changed, 0);
  assert.equal(result.output, source);

  const leaf = `const view = <div>{a === 1 ? b === 2 ? 'one' : (
    // Second branch
    'two'
  ) : 'three'}</div>`;
  const rewritten = transform(leaf);
  assert.equal(rewritten.changed, 1);
  assert.equal(rewritten.output.match(/Second branch/g)?.length, 1);
  assert.match(
    rewritten.output,
    /!\(b === 2\) && \(\/\/ Second branch\n\s*'two'\)/,
  );
});

test("omits null branches only when their guards are stable", () => {
  const source =
    "function View({ layout }: { layout: 'inline' | 'panel' }) { return <div>{layout === 'inline' ? null : layout === 'panel' ? 'panel' : 'other'}</div> }";
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.doesNotMatch(result.output, /&& \(null\)/);
  assert.equal(checked(result.output).changed, 0);

  const existing = checked(
    "function View({ layout }: { layout: 'inline' | 'panel' }) { return <div>{!!(layout === 'inline') && null}<span>ready</span></div> }",
  );
  assert.equal(existing.changed, 1);
  assert.doesNotMatch(existing.output, /&& null/);

  const unstable = transform("const view = <div>{call() && null}</div>");
  assert.equal(unstable.changed, 0);
});

test("omits the built-in undefined but not a shadowed undefined", () => {
  const source =
    "function View({ ready }: { ready: boolean }) { return <div>{ready ? 'yes' : ready === false ? undefined : 'no'}</div> }";
  const result = checked(source, true);
  assert.equal(result.changed, 1);
  assert.doesNotMatch(result.output, /&& \(undefined\)/);

  const shadowed = checked(
    "function View(undefined: string, ready: boolean) { return <div>{ready ? 'yes' : ready === false ? undefined : 'no'}</div> }",
  );
  assert.equal(shadowed.changed, 1);
  assert.match(shadowed.output, /&& \(undefined\)/);
});

test("uses a local early-return function for string-only branches", () => {
  const source =
    "function View({ count, total }: { count: number; total: number }) { return <span>{count === total ? count === 1 ? 'One' : 'All' : `${count} of ${total}`}</span> }";
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.match(result.output, /function getConditionalText/);
  assert.match(result.output, /count: typeof count; total: typeof total/);
  assert.match(result.output, /if \(/);
  assert.match(result.output, /return `\$\{__nestedTernaryValues.count\} of/);
  assert.match(result.output, /getConditionalText\(\{ count, total \}\)/);
  assert.equal(checked(result.output).changed, 0);
});

test("turns a string interpolation choice into early returns", () => {
  const source =
    "function View({ count, total }: { count: number; total: number }) { return <span>{count === total ? count === 1 ? 'One' : 'All' : `${count} of ${total} projects ${count === 1 ? 'needs' : 'need'} an upgrade.`}</span> }";
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.match(
    result.output,
    /if \(__nestedTernaryValues.count === 1\) return/,
  );
  assert.doesNotMatch(result.output, /\? 'needs' : 'need'/);
  assert.equal(checked(result.output).changed, 0);
});

test("does not hoist callback-local values into an outer return", () => {
  const source =
    "function View({ actions }: { actions: string[] }) { return <div>{actions.map((actionType) => <span>{actionType === 'a' ? actionType === 'b' ? 'both' : 'first' : 'other'}</span>)}</div> }";
  const result = checked(source);
  assert.equal(result.changed, 1);
  assert.doesNotMatch(result.output, /function getConditionalText/);
});

test("skips unsafe conditions, dynamic leaves, and attribute expressions", () => {
  for (const source of [
    "const view = <div>{a ? b ? 1 : 2 : 3}</div>",
    "const view = <div>{a === 1 ? b === 2 ? run() : 2 : 3}</div>",
    "const view = <div>{a === 1 ? b === 2 ? <span>{value}</span> : 2 : 3}</div>",
    "const view = <div title={a === 1 ? b === 2 ? 'one' : 'two' : 'three'} />",
    "const view = <div>{a === 1 ? getB() === 2 ? 1 : 2 : 3}</div>",
  ]) {
    const result = transform(source);
    assert.equal(result.changed, 0);
    assert.equal(result.output, source);
    assert.equal(result.skipped.length, 1);
  }
});
