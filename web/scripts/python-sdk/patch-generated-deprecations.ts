import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

type FernAvailability =
  | string
  | {
      status?: string;
      message?: string;
    };

type FernDefinition = {
  service?: {
    endpoints?: Record<
      string,
      {
        availability?: FernAvailability;
      }
    >;
  };
};

export type FernPythonDeprecation = {
  definitionPath: string;
  endpointName: string;
  resourcePath: string;
  methodName: string;
  message: string;
};

type PatchOptions = {
  definitionDirectory: string;
  apiRoot: string;
};

type PatchResult = {
  changedFiles: number;
  decoratedMethods: number;
};

function listYamlFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) return listYamlFiles(entryPath);
      if (entry.isFile() && /\.ya?ml$/.test(entry.name)) return [entryPath];
      return [];
    })
    .sort();
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z\d]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isDeprecated(availability: FernAvailability | undefined): boolean {
  return (
    availability === "deprecated" ||
    (typeof availability === "object" && availability.status === "deprecated")
  );
}

function readDeprecationMessage(
  availability: FernAvailability | undefined,
): string {
  if (
    typeof availability !== "object" ||
    typeof availability.message !== "string"
  ) {
    return "";
  }

  return availability.message.trim();
}

function generatedResourcePath(
  definitionDirectory: string,
  definitionPath: string,
): string {
  const relativePath = path.relative(definitionDirectory, definitionPath);
  const parsedPath = path.parse(relativePath);
  const segments = [
    ...parsedPath.dir.split(path.sep).filter(Boolean),
    parsedPath.name,
  ];

  return path.join(...segments.map(toSnakeCase));
}

export function getFernPythonDeprecations(
  definitionDirectory: string,
): FernPythonDeprecation[] {
  const deprecations = listYamlFiles(definitionDirectory).flatMap(
    (definitionPath) => {
      const definition = parse(
        fs.readFileSync(definitionPath, "utf8"),
      ) as FernDefinition;
      const endpoints = definition.service?.endpoints;

      if (!endpoints) return [];

      return Object.entries(endpoints).flatMap(
        ([endpointName, endpoint]): FernPythonDeprecation[] => {
          if (!isDeprecated(endpoint.availability)) return [];

          const message = readDeprecationMessage(endpoint.availability);
          if (!message) {
            throw new Error(
              `Deprecated endpoint "${endpointName}" in ${definitionPath} must define availability.message`,
            );
          }

          return [
            {
              definitionPath,
              endpointName,
              resourcePath: generatedResourcePath(
                definitionDirectory,
                definitionPath,
              ),
              methodName: toSnakeCase(endpointName),
              message,
            },
          ];
        },
      );
    },
  );

  const seenMethods = new Set<string>();
  for (const deprecation of deprecations) {
    const key = `${deprecation.resourcePath}:${deprecation.methodName}`;
    if (seenMethods.has(key)) {
      throw new Error(
        `Multiple Fern endpoint deprecations resolve to generated Python method ${key}`,
      );
    }
    seenMethods.add(key);
  }

  return deprecations;
}

function pythonStringLiteral(value: string): string {
  // JSON string literals use the same escaping for quotes, backslashes, and
  // control characters as Python double-quoted strings.
  return JSON.stringify(value);
}

function patchMethodPair(
  contents: string,
  deprecation: FernPythonDeprecation,
  clientPath: string,
): { contents: string; decoratedMethods: number } {
  const matches = [
    ...contents.matchAll(/^    (async )?def ([a-zA-Z_]\w*)\(/gm),
  ].filter((match) => match[2] === deprecation.methodName);
  const syncCount = matches.filter((match) => !match[1]).length;
  const asyncCount = matches.filter((match) => Boolean(match[1])).length;

  if (syncCount !== 1 || asyncCount !== 1) {
    throw new Error(
      `${clientPath}: expected one sync and one async ${deprecation.methodName} method for deprecated Fern endpoint "${deprecation.endpointName}", found ${syncCount} sync and ${asyncCount} async`,
    );
  }

  // PEP 702 consumers still surface the message statically; category=None
  // avoids duplicate runtime warnings when the public client calls raw_client.
  const decorator = `    @typing_extensions.deprecated(${pythonStringLiteral(deprecation.message)}, category=None)`;
  let decoratedMethods = 0;

  for (const match of matches.reverse()) {
    const methodStart = match.index;
    const previousLineEnd = methodStart - 1;
    const previousLineStart =
      contents.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const previousLine = contents.slice(previousLineStart, previousLineEnd);

    if (previousLine === decorator) continue;

    if (previousLine.startsWith("    @typing_extensions.deprecated(")) {
      contents = `${contents.slice(0, previousLineStart)}${decorator}${contents.slice(previousLineEnd)}`;
      decoratedMethods += 1;
      continue;
    }

    if (previousLine.trimStart().startsWith("@")) {
      throw new Error(
        `${clientPath}: refusing to insert a deprecation before the existing decorator ${previousLine.trim()}`,
      );
    }

    contents = `${contents.slice(0, methodStart)}${decorator}\n${contents.slice(methodStart)}`;
    decoratedMethods += 1;
  }

  return { contents, decoratedMethods };
}

function ensureTypingExtensionsImport(
  contents: string,
  clientPath: string,
): string {
  const existingImports =
    contents.match(/^import typing_extensions\s*$/gm) ?? [];
  if (existingImports.length === 1) return contents;
  if (existingImports.length > 1) {
    throw new Error(
      `${clientPath}: expected at most one typing_extensions import, found ${existingImports.length}`,
    );
  }

  const typingImports = [...contents.matchAll(/^import typing\s*$/gm)];
  if (typingImports.length !== 1) {
    throw new Error(
      `${clientPath}: expected exactly one generated typing import, found ${typingImports.length}`,
    );
  }

  const typingImport = typingImports[0];
  const insertionPoint = typingImport.index + typingImport[0].length;
  return `${contents.slice(0, insertionPoint)}\nimport typing_extensions${contents.slice(insertionPoint)}`;
}

export function patchGeneratedPythonDeprecations({
  definitionDirectory,
  apiRoot,
}: PatchOptions): PatchResult {
  const deprecations = getFernPythonDeprecations(definitionDirectory);
  const pendingFiles = new Map<
    string,
    { originalContents: string; contents: string }
  >();
  let decoratedMethods = 0;

  for (const deprecation of deprecations) {
    for (const fileName of ["client.py", "raw_client.py"]) {
      const clientPath = path.join(apiRoot, deprecation.resourcePath, fileName);
      let pendingFile = pendingFiles.get(clientPath);
      if (!pendingFile) {
        const contents = fs.readFileSync(clientPath, "utf8");
        pendingFile = { originalContents: contents, contents };
      }
      const patched = patchMethodPair(
        pendingFile.contents,
        deprecation,
        clientPath,
      );

      pendingFile.contents = ensureTypingExtensionsImport(
        patched.contents,
        clientPath,
      );
      decoratedMethods += patched.decoratedMethods;
      pendingFiles.set(clientPath, pendingFile);
    }
  }

  let changedFiles = 0;
  for (const [clientPath, pendingFile] of pendingFiles) {
    if (pendingFile.contents === pendingFile.originalContents) continue;
    fs.writeFileSync(clientPath, pendingFile.contents);
    changedFiles += 1;
  }

  return { changedFiles, decoratedMethods };
}

function main() {
  const { values } = parseArgs({
    options: {
      "definition-root": { type: "string" },
      "api-root": { type: "string" },
    },
    strict: true,
  });

  if (!values["definition-root"] || !values["api-root"]) {
    throw new Error("--definition-root and --api-root are required");
  }

  const result = patchGeneratedPythonDeprecations({
    definitionDirectory: path.resolve(values["definition-root"]),
    apiRoot: path.resolve(values["api-root"]),
  });
  console.log(
    result.changedFiles === 0
      ? "No Python SDK deprecation patch needed."
      : `Patched ${result.decoratedMethods} Python SDK methods across ${result.changedFiles} generated client files.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
