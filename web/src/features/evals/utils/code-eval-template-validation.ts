import type * as ts from "typescript";
export { DEFAULT_TYPESCRIPT_CODE_EVAL_SOURCE } from "@/src/features/evals/utils/code-eval-template-starter-examples";

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

const SYNTHETIC_ASSERTION_PREFIX = `
type __LangfuseExpectedEvaluate = (
  context: EvaluationContext,
) => EvaluationResult | Promise<EvaluationResult>;
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

/**
 * Context passed to every TypeScript code evaluator.
 */
type EvaluationContext = {
  /**
   * Observation data selected by the evaluator target.
   */
  observation: {
    /**
     * Observation input.
     */
    input: unknown;
    /**
     * Observation output.
     */
    output: unknown;
    /**
     * Observation metadata.
     */
    metadata: unknown;
  };
  /**
   * Experiment data when the evaluator runs on experiments.
   */
  experiment?: {
    /**
     * Expected output from the experiment item.
     */
    expectedOutput: unknown;
    /**
     * Metadata from the experiment item.
     */
    itemMetadata: unknown;
  };
};

/**
 * Score emitted by a TypeScript code evaluator.
 */
type Score = {
  /**
   * Optional score name. Falls back to the evaluator score name when omitted.
   */
  name?: string;
  /**
   * Human-readable explanation for the score.
   */
  comment?: string;
  /**
   * Optional score config id.
   */
  configId?: string;
  /**
   * Optional metadata stored on the created score.
   */
  metadata?: Record<string, unknown>;
  /**
   * Score value. BOOLEAN scores may return a boolean, 0/1, or true/false-like string.
   */
  value: number | string | boolean;
  /**
   * Score data type. Omit to let Langfuse infer numeric or categorical values.
   */
  dataType?: "NUMERIC" | "BOOLEAN" | "CATEGORICAL" | "TEXT";
};

/**
 * Return value expected from evaluate.
 */
type EvaluationResult = {
  /**
   * One or more scores created for the target observation.
   */
  scores: Score[];
};
`;

const IGNORED_DIAGNOSTIC_CODES = new Set([2318]);

export async function validateCodeEvalSourceWithTypescript(
  source: string,
): Promise<CodeEvalValidationResult> {
  const tsModule = await import("typescript");
  return validateCodeEvalSource(source, tsModule);
}

export function validateCodeEvalSource(
  source: string,
  tsModule: TypeScriptModule,
): CodeEvalValidationResult {
  const sourceBytes = getUtf8ByteLength(source);
  const diagnostics: CodeEvalDiagnostic[] = [];

  if (source.trim().length === 0) {
    diagnostics.push({
      from: 0,
      to: Math.max(1, source.length),
      severity: "error",
      message: "Enter TypeScript source code for the evaluator.",
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

  const sourceFile = tsModule.createSourceFile(
    "code-eval-template.ts",
    source,
    tsModule.ScriptTarget.Latest,
    true,
    tsModule.ScriptKind.TS,
  );

  const evaluatePosition = findEvaluatePosition(sourceFile, tsModule) ?? 0;
  const hasExportedEvaluate = hasDirectExportedEvaluate(sourceFile, tsModule);

  collectUnsupportedModuleSyntaxDiagnostics(sourceFile, diagnostics, tsModule);

  if (!hasExportedEvaluate) {
    diagnostics.push({
      from: evaluatePosition,
      to: clampToSourceRange(source, evaluatePosition + "evaluate".length),
      severity: "error",
      message: "Evaluator source must export an evaluate function.",
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
  const contractOffset = CONTRACT_DECLARATIONS.length;
  const validationSource = `${CONTRACT_DECLARATIONS}\n${source}\n${SYNTHETIC_ASSERTION_PREFIX}`;
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
      (tsModule.isExportDeclaration(node) && Boolean(node.moduleSpecifier))
    ) {
      diagnostics.push({
        from: node.getStart(sourceFile),
        to: node.getEnd(),
        severity: "error",
        message: "Imports and re-exports are not supported in code evaluators.",
      });
    }

    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);
}

function hasDirectExportedEvaluate(
  sourceFile: ts.SourceFile,
  tsModule: TypeScriptModule,
) {
  let hasExportedEvaluate = false;

  const visit = (node: ts.Node) => {
    if (
      tsModule.isFunctionDeclaration(node) &&
      node.name?.text === "evaluate" &&
      hasExportModifier(node, tsModule)
    ) {
      hasExportedEvaluate = true;
    }

    if (
      tsModule.isVariableStatement(node) &&
      hasExportModifier(node, tsModule) &&
      node.declarationList.declarations.some(
        (declaration) =>
          tsModule.isIdentifier(declaration.name) &&
          declaration.name.text === "evaluate",
      )
    ) {
      hasExportedEvaluate = true;
    }

    if (tsModule.isExportDeclaration(node) && !node.moduleSpecifier) {
      const exportClause = node.exportClause;
      if (exportClause && tsModule.isNamedExports(exportClause)) {
        hasExportedEvaluate ||= exportClause.elements.some(
          (element) => element.name.text === "evaluate",
        );
      }
    }

    node.forEachChild(visit);
  };

  sourceFile.forEachChild(visit);

  return hasExportedEvaluate;
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

function hasExportModifier(
  node: ts.FunctionDeclaration | ts.VariableStatement,
  tsModule: TypeScriptModule,
) {
  return tsModule
    .getModifiers(node)
    ?.some((modifier) => modifier.kind === tsModule.SyntaxKind.ExportKeyword);
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
