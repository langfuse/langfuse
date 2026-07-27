import type * as ts from "typescript";
import type { Diagnostic as RuffDiagnostic } from "@astral-sh/ruff-wasm-web";
import {
  PYTHON_CODE_EVAL_CONTRACT,
  TYPESCRIPT_CODE_EVAL_CONTRACT,
  type CodeEvalSourceCodeLanguage,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

export {
  DEFAULT_PYTHON_CODE_EVAL_SOURCE,
  DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE,
  PREVIOUS_PYTHON_CODE_EVAL_CONTRACTS,
  PREVIOUS_TYPESCRIPT_CODE_EVAL_CONTRACTS,
  PYTHON_CODE_EVAL_CONTRACT,
  TYPESCRIPT_CODE_EVAL_CONTRACT,
  formatAndStripCodeEvalSourceForSubmit,
  getCodeEvalSourceForEditor,
  getDefaultCodeEvalSource,
  isDefaultCodeEvalSource,
  type CodeEvalSourceCodeLanguage,
} from "@/src/features/evals/utils/code-eval-template-starter-examples";

export const CODE_EVAL_SOURCE_MAX_BYTES = 256 * 1024;

export type CodeEvalDiagnosticSeverity = "error" | "warning";

export type CodeEvalDiagnostic = {
  from: number;
  to: number;
  severity: CodeEvalDiagnosticSeverity;
  message: string;
};

export type CodeEvalValidationResult = {
  diagnostics: CodeEvalDiagnostic[];
  hasErrors: boolean;
  sourceBytes: number;
};

type TypeScriptModule = typeof ts;
type RuffWorkspace = {
  check(contents: string): RuffDiagnostic[];
  format(contents: string): string;
};

const SYNTHETIC_ASSERTION_PREFIX = `
type __LangfuseExpectedEvaluate = (
  ctx: EvaluationContext,
) => EvaluationResult | Promise<EvaluationResult>;
const __langfuseEvaluateCheck: __LangfuseExpectedEvaluate = evaluate;
`;

const CONTRACT_DECLARATIONS = `
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
type PromiseSettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: any };

interface Array<T> {
  length: number;
  [n: number]: T;
  at(index: number): T | undefined;
  concat(...items: T[][]): T[];
  concat(...items: (T | T[])[]): T[];
  copyWithin(target: number, start: number, end?: number): this;
  every(callbackfn: (value: T, index: number, array: T[]) => unknown): boolean;
  fill(value: T, start?: number, end?: number): this;
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[];
  flat(depth?: number): any[];
  flatMap<U>(
    callbackfn: (value: T, index: number, array: T[]) => U | U[],
  ): U[];
  filter(callbackfn: (value: T, index: number, array: T[]) => unknown): T[];
  find(callbackfn: (value: T, index: number, array: T[]) => unknown): T | undefined;
  findIndex(callbackfn: (value: T, index: number, array: T[]) => unknown): number;
  findLast(callbackfn: (value: T, index: number, array: T[]) => unknown): T | undefined;
  findLastIndex(callbackfn: (value: T, index: number, array: T[]) => unknown): number;
  forEach(callbackfn: (value: T, index: number, array: T[]) => void): void;
  includes(searchElement: T, fromIndex?: number): boolean;
  indexOf(searchElement: T, fromIndex?: number): number;
  join(separator?: string): string;
  pop(): T | undefined;
  push(...items: T[]): number;
  reduce<U>(
    callbackfn: (
      previousValue: U,
      currentValue: T,
      currentIndex: number,
      array: T[],
    ) => U,
    initialValue: U,
  ): U;
  reduce(
    callbackfn: (
      previousValue: T,
      currentValue: T,
      currentIndex: number,
      array: T[],
    ) => T,
  ): T;
  reduceRight<U>(
    callbackfn: (
      previousValue: U,
      currentValue: T,
      currentIndex: number,
      array: T[],
    ) => U,
    initialValue: U,
  ): U;
  reverse(): T[];
  shift(): T | undefined;
  slice(start?: number, end?: number): T[];
  some(callbackfn: (value: T, index: number, array: T[]) => unknown): boolean;
  sort(compareFn?: (a: T, b: T) => number): this;
  splice(start: number, deleteCount?: number): T[];
  splice(start: number, deleteCount: number, ...items: T[]): T[];
  toReversed(): T[];
  toSorted(compareFn?: (a: T, b: T) => number): T[];
  toSpliced(start: number, deleteCount?: number): T[];
  toSpliced(start: number, deleteCount: number, ...items: T[]): T[];
  unshift(...items: T[]): number;
  with(index: number, value: T): T[];
}

interface ArrayConstructor {
  from<T>(arrayLike: ArrayLike<T>): T[];
  from<T, U>(
    arrayLike: ArrayLike<T>,
    mapfn: (value: T, index: number) => U,
  ): U[];
  from<T>(values: IterableLike<T>): T[];
  from<T, U>(
    values: IterableLike<T>,
    mapfn: (value: T, index: number) => U,
  ): U[];
  from<T>(values: IteratorLike<T>): T[];
  from<T, U>(
    values: IteratorLike<T>,
    mapfn: (value: T, index: number) => U,
  ): U[];
  from<K, V>(values: Map<K, V>): [K, V][];
  from<T>(values: Set<T>): T[];
  isArray(value: unknown): value is unknown[];
  of<T>(...items: T[]): T[];
}

interface Boolean {}

interface Date {
  getDate(): number;
  getDay(): number;
  getFullYear(): number;
  getHours(): number;
  getMilliseconds(): number;
  getMinutes(): number;
  getMonth(): number;
  getSeconds(): number;
  getTime(): number;
  getUTCDate(): number;
  getUTCDay(): number;
  getUTCFullYear(): number;
  getUTCHours(): number;
  getUTCMilliseconds(): number;
  getUTCMinutes(): number;
  getUTCMonth(): number;
  getUTCSeconds(): number;
  setDate(date: number): number;
  setFullYear(year: number, month?: number, date?: number): number;
  setHours(hours: number, min?: number, sec?: number, ms?: number): number;
  setMilliseconds(ms: number): number;
  setMinutes(min: number, sec?: number, ms?: number): number;
  setMonth(month: number, date?: number): number;
  setSeconds(sec: number, ms?: number): number;
  setTime(time: number): number;
  setUTCDate(date: number): number;
  setUTCFullYear(year: number, month?: number, date?: number): number;
  setUTCHours(hours: number, min?: number, sec?: number, ms?: number): number;
  setUTCMilliseconds(ms: number): number;
  setUTCMinutes(min: number, sec?: number, ms?: number): number;
  setUTCMonth(month: number, date?: number): number;
  setUTCSeconds(sec: number, ms?: number): number;
  toDateString(): string;
  toISOString(): string;
  toJSON(): string;
  toString(): string;
  toTimeString(): string;
  toUTCString(): string;
  valueOf(): number;
}

interface DateConstructor {
  new (): Date;
  new (value: number | string): Date;
  new (
    year: number,
    monthIndex: number,
    date?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
    ms?: number,
  ): Date;
  (): string;
  now(): number;
  parse(dateString: string): number;
  UTC(
    year: number,
    monthIndex: number,
    date?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
    ms?: number,
  ): number;
}

interface Error {
  name: string;
  message: string;
  stack?: string;
}

interface ErrorConstructor {
  new (message?: string): Error;
  (message?: string): Error;
}

interface ArrayLike<T> {
  readonly length: number;
  readonly [n: number]: T;
}

interface IterableLike<T> {
  values(): T[];
}

interface IteratorResult<T> {
  done?: boolean;
  value: T;
}

interface IteratorLike<T> {
  next(): IteratorResult<T>;
}

interface Map<K, V> {
  readonly size: number;
  clear(): void;
  delete(key: K): boolean;
  entries(): IteratorLike<[K, V]>;
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void;
  get(key: K): V | undefined;
  has(key: K): boolean;
  keys(): IteratorLike<K>;
  set(key: K, value: V): this;
  values(): IteratorLike<V>;
}

interface MapConstructor {
  new <K, V>(entries?: [K, V][]): Map<K, V>;
}

interface Number {
  toFixed(fractionDigits?: number): string;
  toPrecision(precision?: number): string;
  toString(radix?: number): string;
  valueOf(): number;
}

interface NumberConstructor {
  (value?: unknown): number;
  readonly EPSILON: number;
  readonly MAX_SAFE_INTEGER: number;
  readonly MAX_VALUE: number;
  readonly MIN_SAFE_INTEGER: number;
  readonly MIN_VALUE: number;
  readonly NaN: number;
  readonly NEGATIVE_INFINITY: number;
  readonly POSITIVE_INFINITY: number;
  isFinite(value: unknown): boolean;
  isInteger(value: unknown): boolean;
  isNaN(value: unknown): boolean;
  isSafeInteger(value: unknown): boolean;
  parseFloat(string: string): number;
  parseInt(string: string, radix?: number): number;
}

interface Object {
  hasOwnProperty(key: string): boolean;
  propertyIsEnumerable(key: string): boolean;
  toString(): string;
  valueOf(): object;
}

interface ObjectConstructor {
  assign<T extends object, U>(target: T, source: U): T & U;
  freeze<T extends object>(value: T): T;
  getOwnPropertyNames(value: object): string[];
  is(value1: unknown, value2: unknown): boolean;
  keys(value: object): string[];
  seal<T extends object>(value: T): T;
  values<T>(value: Record<string, T>): T[];
  values(value: object): unknown[];
  entries<T>(value: Record<string, T>): [string, T][];
  entries(value: object): [string, unknown][];
  fromEntries<T>(entries: [string, T][]): Record<string, T>;
  hasOwn(value: object, key: string): boolean;
}

interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2>;
}

interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2>;
}

interface PromiseConstructor {
  new <T>(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void,
    ) => void,
  ): Promise<T>;
  all<T>(values: T[]): Promise<Awaited<T>[]>;
  allSettled<T>(values: T[]): Promise<PromiseSettledResult<Awaited<T>>[]>;
  any<T>(values: T[]): Promise<Awaited<T>>;
  race<T>(values: T[]): Promise<Awaited<T>>;
  resolve<T>(value: T | PromiseLike<T>): Promise<T>;
  reject<T = never>(reason?: any): Promise<T>;
}

interface RegExp {
  readonly flags: string;
  readonly global: boolean;
  readonly ignoreCase: boolean;
  lastIndex: number;
  readonly multiline: boolean;
  readonly source: string;
  readonly sticky: boolean;
  readonly unicode: boolean;
  exec(string: string): RegExpExecArray | null;
  test(string: string): boolean;
  toString(): string;
}

interface RegExpConstructor {
  new (pattern: string | RegExp, flags?: string): RegExp;
  (pattern: string | RegExp, flags?: string): RegExp;
}

interface RegExpMatchArray extends Array<string> {
  index?: number;
  input?: string;
  groups?: Record<string, string>;
}

interface RegExpExecArray extends Array<string> {
  index: number;
  input: string;
  groups?: Record<string, string>;
}

interface Set<T> {
  readonly size: number;
  add(value: T): this;
  clear(): void;
  delete(value: T): boolean;
  entries(): IteratorLike<[T, T]>;
  forEach(callbackfn: (value: T, value2: T, set: Set<T>) => void): void;
  has(value: T): boolean;
  keys(): IteratorLike<T>;
  values(): IteratorLike<T>;
}

interface SetConstructor {
  new <T>(values?: T[]): Set<T>;
}

interface String {
  readonly length: number;
  at(index: number): string | undefined;
  charAt(pos: number): string;
  charCodeAt(index: number): number;
  codePointAt(pos: number): number | undefined;
  concat(...strings: string[]): string;
  endsWith(searchString: string, endPosition?: number): boolean;
  includes(searchString: string, position?: number): boolean;
  indexOf(searchString: string, position?: number): number;
  lastIndexOf(searchString: string, position?: number): number;
  localeCompare(that: string): number;
  match(regexp: RegExp): RegExpMatchArray | null;
  matchAll(regexp: RegExp): IteratorLike<RegExpMatchArray>;
  normalize(form?: string): string;
  padEnd(maxLength: number, fillString?: string): string;
  padStart(maxLength: number, fillString?: string): string;
  repeat(count: number): string;
  replace(
    searchValue: string | RegExp,
    replaceValue: string,
  ): string;
  replace(
    searchValue: string | RegExp,
    replacer: (
      substring: string,
      ...args: any[]
    ) => string,
  ): string;
  replaceAll(
    searchValue: string | RegExp,
    replaceValue: string,
  ): string;
  search(regexp: RegExp): number;
  slice(start?: number, end?: number): string;
  split(separator: string | RegExp, limit?: number): string[];
  startsWith(searchString: string, position?: number): boolean;
  substring(start: number, end?: number): string;
  trim(): string;
  trimEnd(): string;
  trimStart(): string;
  toLocaleLowerCase(): string;
  toLocaleUpperCase(): string;
  toLowerCase(): string;
  toString(): string;
  toUpperCase(): string;
}

interface StringConstructor {
  (value?: unknown): string;
  fromCharCode(...codes: number[]): string;
  fromCodePoint(...codePoints: number[]): string;
}

interface WeakMap<K extends object, V> {
  delete(key: K): boolean;
  get(key: K): V | undefined;
  has(key: K): boolean;
  set(key: K, value: V): this;
}

interface WeakMapConstructor {
  new <K extends object, V>(entries?: [K, V][]): WeakMap<K, V>;
}

interface WeakSet<T extends object> {
  add(value: T): this;
  delete(value: T): boolean;
  has(value: T): boolean;
}

interface WeakSetConstructor {
  new <T extends object>(values?: T[]): WeakSet<T>;
}

interface Uint8Array {
  readonly length: number;
  [n: number]: number;
  forEach(
    callbackfn: (value: number, index: number, array: Uint8Array) => void,
  ): void;
  slice(start?: number, end?: number): Uint8Array;
  subarray(begin?: number, end?: number): Uint8Array;
}

type Record<K extends string, T> = { [P in K]: T };

declare const Promise: PromiseConstructor;
declare const Array: ArrayConstructor;
declare const Error: ErrorConstructor;
declare const Map: MapConstructor;
declare const Object: ObjectConstructor;
declare const RegExp: RegExpConstructor;
declare const Set: SetConstructor;
declare const String: StringConstructor;
declare const Number: NumberConstructor;
declare const Boolean: (value?: unknown) => boolean;
declare const WeakMap: WeakMapConstructor;
declare const WeakSet: WeakSetConstructor;
declare const JSON: {
  parse(text: string, reviver?: (key: string, value: any) => any): any;
  stringify(value: unknown, replacer?: unknown, space?: string | number): string;
};
declare const Math: {
  abs(value: number): number;
  ceil(value: number): number;
  floor(value: number): number;
  max(...values: number[]): number;
  min(...values: number[]): number;
  pow(x: number, y: number): number;
  round(value: number): number;
  sign(value: number): number;
  sqrt(value: number): number;
  trunc(value: number): number;
};
declare const Date: DateConstructor;
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
declare function setTimeout(
  callback: (...args: any[]) => void,
  delay?: number,
  ...args: any[]
): unknown;
declare function clearTimeout(handle?: unknown): void;
declare function setInterval(
  callback: (...args: any[]) => void,
  delay?: number,
  ...args: any[]
): unknown;
declare function clearInterval(handle?: unknown): void;
declare function queueMicrotask(callback: () => void): void;
declare function isFinite(value: unknown): boolean;
declare function isNaN(value: unknown): boolean;
declare function parseFloat(string: string): number;
declare function parseInt(string: string, radix?: number): number;
declare function decodeURI(encodedURI: string): string;
declare function decodeURIComponent(encodedURIComponent: string): string;
declare function encodeURI(uri: string): string;
declare function encodeURIComponent(uriComponent: string): string;
declare function structuredClone<T>(value: T): T;
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  decode(input?: Uint8Array): string;
}
declare class URL {
  constructor(url: string, base?: string | URL);
  hash: string;
  host: string;
  href: string;
  hostname: string;
  origin: string;
  pathname: string;
  password: string;
  port: string;
  protocol: string;
  search: string;
  searchParams: URLSearchParams;
  username: string;
  toString(): string;
}
declare class URLSearchParams {
  constructor(init?: string | Record<string, string> | string[][] | URLSearchParams);
  append(name: string, value: string): void;
  delete(name: string): void;
  forEach(
    callbackfn: (value: string, key: string, parent: URLSearchParams) => void,
  ): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  keys(): IteratorLike<string>;
  set(name: string, value: string): void;
  sort(): void;
  toString(): string;
  values(): IteratorLike<string>;
  entries(): IteratorLike<[string, string]>;
}
`;

const IGNORED_DIAGNOSTIC_CODES = new Set([2318]);
const PYTHON_RUFF_SETTINGS = {
  "line-length": 88,
  "indent-width": 2,
  lint: {
    select: ["E4", "E7", "E9", "F"],
    // The contract is prepended to the user's source before linting (and at
    // execution time), so user imports are never at the literal top of the
    // file — E402 would flag every import.
    ignore: ["E402"],
  },
};
const PYTHON_ERROR_DIAGNOSTIC_CODES = new Set([
  "invalid-syntax",
  "F821",
  "F822",
  "F823",
]);
const PYTHON_EVALUATE_SIGNATURE_PATTERN =
  /(?:^|\n)\s*def\s+evaluate\s*\(\s*ctx\s*:\s*EvaluationContext\s*\)\s*->\s*EvaluationResult\s*:/;
let ruffWorkspacePromise: Promise<RuffWorkspace> | null = null;

export async function validateCodeEvalSourceWithLanguage({
  source,
  sourceCodeLanguage,
}: {
  source: string;
  sourceCodeLanguage: CodeEvalSourceCodeLanguage;
}): Promise<CodeEvalValidationResult> {
  if (sourceCodeLanguage === "PYTHON") {
    return validateCodeEvalSourceWithPython(source);
  }

  return validateCodeEvalSourceWithTypescript(source);
}

export async function validateCodeEvalSourceWithTypescript(
  source: string,
): Promise<CodeEvalValidationResult> {
  const tsModule = await import("typescript");
  return validateCodeEvalSource(source, tsModule);
}

export async function validateCodeEvalSourceWithPython(
  source: string,
): Promise<CodeEvalValidationResult> {
  const sourceBytes = getUtf8ByteLength(source);
  const diagnostics: CodeEvalDiagnostic[] = [];
  const validationSource = hasPythonContractDeclarations(source)
    ? source
    : `${PYTHON_CODE_EVAL_CONTRACT}\n\n${source}`;

  collectBasicSourceDiagnostics({
    source,
    sourceBytes,
    languageLabel: "Python",
    diagnostics,
  });

  if (!hasPythonEvaluateFunction(source)) {
    const evaluatePosition = findPythonEvaluatePosition(source) ?? 0;
    diagnostics.push({
      from: evaluatePosition,
      to: clampToSourceRange(source, evaluatePosition + "evaluate".length),
      severity: "error",
      message: "Evaluator source must define an evaluate function.",
    });
  }

  collectPythonContractDiagnostics(source, diagnostics);

  try {
    const ruffWorkspace = await getPythonRuffWorkspace();
    diagnostics.push(
      ...ruffWorkspace.check(validationSource).map((diagnostic) =>
        mapRuffDiagnosticToCodeEvalDiagnostic({
          source,
          locationSource: validationSource,
          diagnostic,
          offset: validationSource === source ? 0 : -getValidationOffset(),
        }),
      ),
    );
  } catch (error) {
    diagnostics.push({
      from: 0,
      to: Math.max(1, source.length),
      severity: "error",
      message:
        error instanceof Error
          ? `Failed to lint Python source with Ruff: ${error.message}`
          : "Failed to lint Python source with Ruff.",
    });
  }

  return {
    diagnostics: sortDiagnostics(diagnostics),
    hasErrors: diagnostics.some(
      (diagnostic) => diagnostic.severity === "error",
    ),
    sourceBytes,
  };
}

export async function formatPythonCodeEvalSourceWithRuff(source: string) {
  const ruffWorkspace = await getPythonRuffWorkspace();
  return ruffWorkspace.format(source);
}

export function validateCodeEvalSource(
  source: string,
  tsModule: TypeScriptModule,
): CodeEvalValidationResult {
  const sourceBytes = getUtf8ByteLength(source);
  const diagnostics: CodeEvalDiagnostic[] = [];

  collectBasicSourceDiagnostics({
    source,
    sourceBytes,
    languageLabel: "TypeScript",
    diagnostics,
  });

  const sourceFile = tsModule.createSourceFile(
    "code-eval-template.ts",
    source,
    tsModule.ScriptTarget.Latest,
    true,
    tsModule.ScriptKind.TS,
  );

  const evaluatePosition = findEvaluatePosition(sourceFile, tsModule) ?? 0;
  const hasEvaluate = hasEvaluateFunction(sourceFile, tsModule);

  collectUnsupportedModuleSyntaxDiagnostics(sourceFile, diagnostics, tsModule);

  if (!hasEvaluate) {
    diagnostics.push({
      from: evaluatePosition,
      to: clampToSourceRange(source, evaluatePosition + "evaluate".length),
      severity: "error",
      message: "Evaluator source must define an evaluate function.",
    });
  }

  diagnostics.push(
    ...getTypeScriptDiagnostics({
      source,
      evaluatePosition,
      tsModule,
    }),
  );

  return {
    diagnostics: sortDiagnostics(diagnostics),
    hasErrors: diagnostics.some(
      (diagnostic) => diagnostic.severity === "error",
    ),
    sourceBytes,
  };
}

function getTypeScriptDiagnostics({
  source,
  evaluatePosition,
  tsModule,
}: {
  source: string;
  evaluatePosition: number;
  tsModule: TypeScriptModule;
}): CodeEvalDiagnostic[] {
  const validationPrelude = [
    CONTRACT_DECLARATIONS,
    getTypeScriptContractForValidation(source),
  ]
    .filter(Boolean)
    .join("\n");
  const contractOffset = validationPrelude.length;
  const validationSource = `${validationPrelude}\n${source}\n${SYNTHETIC_ASSERTION_PREFIX}`;
  const fileName = "code-eval-template.ts";
  const compilerOptions: ts.CompilerOptions = {
    target: tsModule.ScriptTarget.ES2022,
    module: tsModule.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    noLib: true,
    erasableSyntaxOnly: true,
  };
  const host: ts.CompilerHost = {
    getSourceFile: (requestedFileName, languageVersion) =>
      requestedFileName === fileName
        ? tsModule.createSourceFile(
            requestedFileName,
            validationSource,
            languageVersion,
            true,
            tsModule.ScriptKind.TS,
          )
        : undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => "",
    getDirectories: () => [],
    fileExists: (requestedFileName) => requestedFileName === fileName,
    readFile: (requestedFileName) =>
      requestedFileName === fileName ? validationSource : undefined,
    getCanonicalFileName: (file) => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };

  const program = tsModule.createProgram([fileName], compilerOptions, host);
  const allDiagnostics = tsModule
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => !IGNORED_DIAGNOSTIC_CODES.has(diagnostic.code));

  return allDiagnostics.flatMap((diagnostic) => {
    const message = tsModule.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n",
    );
    const start = diagnostic.start ?? contractOffset + evaluatePosition;
    const length = diagnostic.length ?? 1;
    const sourceStart = mapValidationOffsetToSourceOffset({
      offset: start,
      contractOffset,
      sourceLength: source.length,
      fallbackOffset: evaluatePosition,
    });

    if (sourceStart === null) return [];

    return [
      {
        from: clampToSourceRange(source, sourceStart),
        to: clampToSourceRange(source, sourceStart + length),
        severity: "error" as const,
        message,
      },
    ];
  });
}

function getTypeScriptContractForValidation(source: string) {
  return hasTypeScriptContractDeclarations(source)
    ? ""
    : TYPESCRIPT_CODE_EVAL_CONTRACT;
}

function hasTypeScriptContractDeclarations(source: string) {
  return (
    /\btype\s+EvaluationContext\s*=/.test(source) &&
    /\btype\s+Score\s*=/.test(source) &&
    /\btype\s+EvaluationResult\s*=/.test(source)
  );
}

// Like hasTypeScriptContractDeclarations: detect the declarations themselves
// instead of an exact contract prefix, so user code that happens to share the
// contract's first line still gets the hidden contract injected.
function hasPythonContractDeclarations(source: string) {
  return (
    /\bclass\s+EvaluationContext\b/.test(source) &&
    /\bclass\s+Score\b/.test(source) &&
    /\bclass\s+EvaluationResult\b/.test(source)
  );
}

function mapValidationOffsetToSourceOffset({
  offset,
  contractOffset,
  sourceLength,
  fallbackOffset,
}: {
  offset: number;
  contractOffset: number;
  sourceLength: number;
  fallbackOffset: number;
}) {
  if (offset < contractOffset) return null;

  const sourceOffset = offset - contractOffset - 1;
  if (sourceOffset >= 0 && sourceOffset <= sourceLength) return sourceOffset;

  return fallbackOffset;
}

function collectUnsupportedModuleSyntaxDiagnostics(
  sourceFile: ts.SourceFile,
  diagnostics: CodeEvalDiagnostic[],
  tsModule: TypeScriptModule,
) {
  const visit = (node: ts.Node) => {
    if (
      tsModule.isImportDeclaration(node) ||
      tsModule.isExportDeclaration(node)
    ) {
      diagnostics.push({
        from: node.getStart(sourceFile),
        to: node.getEnd(),
        severity: "error",
        message: "Imports and exports are not supported in code evaluators.",
      });
    }

    const modifiers = tsModule.canHaveModifiers(node)
      ? tsModule.getModifiers(node)
      : undefined;

    if (
      modifiers?.some(
        (modifier) => modifier.kind === tsModule.SyntaxKind.ExportKeyword,
      )
    ) {
      diagnostics.push({
        from: node.getStart(sourceFile),
        to: node.getEnd(),
        severity: "error",
        message:
          "Exports are not supported. Define `function evaluate(ctx: EvaluationContext): EvaluationResult` instead.",
      });
    }

    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);
}

function hasEvaluateFunction(
  sourceFile: ts.SourceFile,
  tsModule: TypeScriptModule,
) {
  let hasEvaluate = false;

  const visit = (node: ts.Node) => {
    if (
      tsModule.isFunctionDeclaration(node) &&
      node.name?.text === "evaluate"
    ) {
      hasEvaluate = true;
    }

    if (
      tsModule.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) =>
          tsModule.isIdentifier(declaration.name) &&
          declaration.name.text === "evaluate",
      )
    ) {
      hasEvaluate = true;
    }

    if (tsModule.isExportDeclaration(node) && !node.moduleSpecifier) {
      const exportClause = node.exportClause;
      if (exportClause && tsModule.isNamedExports(exportClause)) {
        hasEvaluate ||= exportClause.elements.some(
          (element) => element.name.text === "evaluate",
        );
      }
    }

    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);

  return hasEvaluate;
}

function findEvaluatePosition(
  sourceFile: ts.SourceFile,
  tsModule: TypeScriptModule,
) {
  let position: number | undefined;

  const visit = (node: ts.Node) => {
    if (
      position === undefined &&
      tsModule.isFunctionDeclaration(node) &&
      node.name?.text === "evaluate"
    ) {
      position = node.name.getStart(sourceFile);
      return;
    }

    if (
      position === undefined &&
      tsModule.isVariableDeclaration(node) &&
      tsModule.isIdentifier(node.name) &&
      node.name.text === "evaluate"
    ) {
      position = node.name.getStart(sourceFile);
      return;
    }

    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);

  return position;
}

function collectBasicSourceDiagnostics({
  source,
  sourceBytes,
  languageLabel,
  diagnostics,
}: {
  source: string;
  sourceBytes: number;
  languageLabel: string;
  diagnostics: CodeEvalDiagnostic[];
}) {
  if (source.trim().length === 0) {
    diagnostics.push({
      from: 0,
      to: Math.max(1, source.length),
      severity: "error",
      message: `Enter ${languageLabel} source code for the evaluator.`,
    });
  }

  if (sourceBytes > CODE_EVAL_SOURCE_MAX_BYTES) {
    diagnostics.push({
      from: 0,
      to: Math.max(1, source.length),
      severity: "error",
      message: `Source code must be ${CODE_EVAL_SOURCE_MAX_BYTES} bytes or less.`,
    });
  }
}

function collectPythonContractDiagnostics(
  source: string,
  diagnostics: CodeEvalDiagnostic[],
) {
  if (source.trim().length === 0) return;

  if (
    hasPythonEvaluateFunction(source) &&
    !PYTHON_EVALUATE_SIGNATURE_PATTERN.test(source)
  ) {
    const evaluatePosition = findPythonEvaluatePosition(source) ?? 0;
    diagnostics.push({
      from: evaluatePosition,
      to: clampToSourceRange(source, evaluatePosition + "evaluate".length),
      severity: "warning",
      message:
        "Python evaluators should use `def evaluate(ctx: EvaluationContext) -> EvaluationResult:`.",
    });
  }
}

async function getPythonRuffWorkspace(): Promise<RuffWorkspace> {
  ruffWorkspacePromise ??= import("@astral-sh/ruff-wasm-web").then(
    async (ruffModule) => {
      await ruffModule.default();
      return new ruffModule.Workspace(
        PYTHON_RUFF_SETTINGS,
        ruffModule.PositionEncoding.Utf16,
      ) as RuffWorkspace;
    },
  );

  return ruffWorkspacePromise;
}

function hasPythonEvaluateFunction(source: string) {
  return /(?:^|\n)\s*(?:async\s+)?def\s+evaluate\s*\(/.test(source);
}

function findPythonEvaluatePosition(source: string) {
  const match = source.match(/(?:^|\n)(\s*(?:async\s+)?def\s+)(evaluate)\s*\(/);
  if (!match || match.index === undefined) return undefined;

  return match.index + match[0].indexOf("evaluate");
}

function mapRuffDiagnosticToCodeEvalDiagnostic({
  source,
  locationSource,
  diagnostic,
  offset,
}: {
  source: string;
  locationSource: string;
  diagnostic: RuffDiagnostic;
  offset: number;
}): CodeEvalDiagnostic {
  const from = clampToSourceRange(
    source,
    mapRuffLocationToSourceOffset(locationSource, diagnostic.start_location) +
      offset,
  );
  const to = Math.max(
    from + 1,
    clampToSourceRange(
      source,
      mapRuffLocationToSourceOffset(locationSource, diagnostic.end_location) +
        offset,
    ),
  );

  return {
    from,
    to,
    severity: getRuffDiagnosticSeverity(diagnostic),
    message: diagnostic.code
      ? `${diagnostic.code}: ${diagnostic.message}`
      : diagnostic.message,
  };
}

function getValidationOffset() {
  return `${PYTHON_CODE_EVAL_CONTRACT}\n\n`.length;
}

function getRuffDiagnosticSeverity(
  diagnostic: RuffDiagnostic,
): CodeEvalDiagnosticSeverity {
  const code = diagnostic.code ?? "";
  return code.startsWith("E9") || PYTHON_ERROR_DIAGNOSTIC_CODES.has(code)
    ? "error"
    : "warning";
}

function mapRuffLocationToSourceOffset(
  source: string,
  location: RuffDiagnostic["start_location"],
) {
  const lineStartOffsets = getLineStartOffsets(source);
  const rowIndex = Math.max(0, location.row - 1);
  const lineStart = lineStartOffsets[rowIndex] ?? source.length;
  const lineEnd =
    rowIndex + 1 < lineStartOffsets.length
      ? lineStartOffsets[rowIndex + 1] - 1
      : source.length;

  return clampToSourceRange(
    source,
    Math.min(lineEnd, lineStart + Math.max(0, location.column - 1)),
  );
}

function getLineStartOffsets(source: string) {
  const offsets = [0];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function clampToSourceRange(source: string, offset: number) {
  return Math.max(0, Math.min(source.length, offset));
}

function sortDiagnostics(diagnostics: CodeEvalDiagnostic[]) {
  return [...diagnostics].sort((a, b) => a.from - b.from || a.to - b.to);
}

export function getUtf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
