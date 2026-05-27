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
) => EvaluationResult;
const __langfuseEvaluateCheck: __LangfuseExpectedEvaluate = evaluate;
`;

const CONTRACT_DECLARATIONS = `
interface Array<T> {
  length: number;
  [n: number]: T;
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[];
  filter(callbackfn: (value: T, index: number, array: T[]) => unknown): T[];
  includes(searchElement: T, fromIndex?: number): boolean;
  join(separator?: string): string;
}

interface Boolean {}

interface Number {}

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

interface String {
  includes(searchString: string, position?: number): boolean;
  trim(): string;
  toLowerCase(): string;
  toString(): string;
}

type Record<K extends string, T> = { [P in K]: T };

declare const String: (value?: unknown) => string;
declare const Number: (value?: unknown) => number;
declare const Boolean: (value?: unknown) => boolean;
declare const JSON: {
  parse(text: string): unknown;
  stringify(value: unknown): string;
};
declare const Math: {
  abs(value: number): number;
  max(...values: number[]): number;
  min(...values: number[]): number;
  round(value: number): number;
};
declare const Date: any;
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
`;

const IGNORED_DIAGNOSTIC_CODES = new Set([2318]);
const PYTHON_RUFF_SETTINGS = {
  "line-length": 88,
  "indent-width": 4,
  lint: {
    select: ["E4", "E7", "E9", "F"],
  },
};
const PYTHON_ERROR_DIAGNOSTIC_CODES = new Set([
  "invalid-syntax",
  "F821",
  "F822",
  "F823",
]);
const PYTHON_CONTRACT_PREFIX = "from dataclasses import dataclass";
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
  const validationSource = source.trimStart().startsWith(PYTHON_CONTRACT_PREFIX)
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

  if (!source.trimStart().startsWith(PYTHON_CONTRACT_PREFIX)) {
    diagnostics.push({
      from: 0,
      to: Math.min(source.length, PYTHON_CONTRACT_PREFIX.length),
      severity: "warning",
      message: `Python evaluators should start with \`${PYTHON_CONTRACT_PREFIX}\`.`,
    });
  }

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
