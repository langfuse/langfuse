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

type FernProperty = {
  availability?: FernAvailability;
};

type FernEndpoint = {
  availability?: FernAvailability;
  request?: {
    name?: string;
    body?: {
      properties?: Record<string, FernProperty>;
    };
  };
};

type FernDefinition = {
  service?: {
    endpoints?: Record<string, FernEndpoint>;
  };
};

type FernTypeScriptEndpointDeprecation = {
  kind: "endpoint";
  definitionPath: string;
  endpointName: string;
  generatedPath: string;
  methodName: string;
  message: string;
};

type FernTypeScriptPropertyDeprecation = {
  kind: "property";
  definitionPath: string;
  generatedPath: string;
  typeName: string;
  propertyName: string;
  message: string;
};

export type FernTypeScriptDeprecation =
  | FernTypeScriptEndpointDeprecation
  | FernTypeScriptPropertyDeprecation;

type PatchOptions = {
  definitionDirectory: string;
  apiRoot: string;
};

type PatchResult = {
  changedFiles: number;
  decoratedSymbols: number;
};

type PendingFile = {
  originalContents: string;
  contents: string;
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

function toLowerCamelCase(value: string): string {
  const joined = value.replace(
    /[^a-zA-Z\d]+([a-zA-Z\d])/g,
    (_match, character: string) => character.toUpperCase(),
  );
  return joined ? `${joined[0].toLowerCase()}${joined.slice(1)}` : joined;
}

function definitionResourceSegments(
  definitionDirectory: string,
  definitionPath: string,
): string[] {
  const relativePath = path.relative(definitionDirectory, definitionPath);
  const parsedPath = path.parse(relativePath);
  return [
    ...parsedPath.dir.split(path.sep).filter(Boolean),
    parsedPath.name,
  ].map(toLowerCamelCase);
}

function generatedResourceRoot(resourceSegments: string[]): string {
  const nestedSegments = resourceSegments.flatMap((segment, index) =>
    index === 0 ? [segment] : ["resources", segment],
  );
  return path.join("api", "resources", ...nestedSegments);
}

function isDeprecated(availability: FernAvailability | undefined): boolean {
  return (
    availability === "deprecated" ||
    (typeof availability === "object" && availability.status === "deprecated")
  );
}

function readDeprecationMessage(
  availability: FernAvailability | undefined,
  label: string,
): string {
  const message =
    typeof availability === "object" && typeof availability.message === "string"
      ? availability.message.trim()
      : "";

  if (!message) {
    throw new Error(`${label} must define availability.message`);
  }
  if (/\r|\n/.test(message)) {
    throw new Error(`${label} must use a single-line availability.message`);
  }
  if (message.includes("*/")) {
    throw new Error(`${label} has an availability.message that closes JSDoc`);
  }
  return message;
}

function availabilityPathKey(segments: string[]): string {
  return JSON.stringify(segments);
}

function deprecatedAvailabilityPaths(
  value: unknown,
  prefix: string[] = [],
): string[][] {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = [...prefix, key];
    const ownPath =
      key === "availability" &&
      isDeprecated(child as FernAvailability | undefined)
        ? [childPath]
        : [];
    return [...ownPath, ...deprecatedAvailabilityPaths(child, childPath)];
  });
}

function propertyGeneratedPath(resourceRoot: string, typeName: string): string {
  return path.join(resourceRoot, "client", "requests", `${typeName}.ts`);
}

export function getFernTypeScriptDeprecations(
  definitionDirectory: string,
): FernTypeScriptDeprecation[] {
  const deprecations: FernTypeScriptDeprecation[] = [];

  for (const definitionPath of listYamlFiles(definitionDirectory)) {
    const definition = parse(
      fs.readFileSync(definitionPath, "utf8"),
    ) as FernDefinition;
    const resourceRoot = generatedResourceRoot(
      definitionResourceSegments(definitionDirectory, definitionPath),
    );
    const handledAvailabilityPaths = new Set<string>();

    for (const [endpointName, endpoint] of Object.entries(
      definition.service?.endpoints ?? {},
    )) {
      const endpointAvailabilityPath = [
        "service",
        "endpoints",
        endpointName,
        "availability",
      ];
      if (isDeprecated(endpoint.availability)) {
        handledAvailabilityPaths.add(
          availabilityPathKey(endpointAvailabilityPath),
        );

        deprecations.push({
          kind: "endpoint",
          definitionPath,
          endpointName,
          generatedPath: path.join(resourceRoot, "client", "Client.ts"),
          methodName: toLowerCamelCase(endpointName),
          message: readDeprecationMessage(
            endpoint.availability,
            `Deprecated endpoint "${endpointName}" in ${definitionPath}`,
          ),
        });
      }

      for (const [propertyName, property] of Object.entries(
        endpoint.request?.body?.properties ?? {},
      )) {
        if (!isDeprecated(property.availability)) continue;

        const propertyAvailabilityPath = [
          "service",
          "endpoints",
          endpointName,
          "request",
          "body",
          "properties",
          propertyName,
          "availability",
        ];
        handledAvailabilityPaths.add(
          availabilityPathKey(propertyAvailabilityPath),
        );
        const requestName = endpoint.request?.name;
        if (!requestName) {
          throw new Error(
            `Deprecated request property "${propertyName}" on endpoint "${endpointName}" in ${definitionPath} requires request.name`,
          );
        }

        deprecations.push({
          kind: "property",
          definitionPath,
          generatedPath: propertyGeneratedPath(resourceRoot, requestName),
          typeName: requestName,
          propertyName: toLowerCamelCase(propertyName),
          message: readDeprecationMessage(
            property.availability,
            `Deprecated request property "${propertyName}" on endpoint "${endpointName}" in ${definitionPath}`,
          ),
        });
      }
    }

    const unsupported = deprecatedAvailabilityPaths(definition).filter(
      (segments) =>
        !handledAvailabilityPaths.has(availabilityPathKey(segments)),
    );
    if (unsupported.length > 0) {
      throw new Error(
        `Unsupported deprecated availability in ${definitionPath} at ${unsupported
          .map((segments) => segments.join("."))
          .join(", ")}`,
      );
    }
  }

  const generatedSymbols = new Set<string>();
  for (const deprecation of deprecations) {
    const symbol =
      deprecation.kind === "endpoint"
        ? `${deprecation.generatedPath}:method:${deprecation.methodName}`
        : `${deprecation.generatedPath}:property:${deprecation.typeName}.${deprecation.propertyName}`;
    if (generatedSymbols.has(symbol)) {
      throw new Error(
        `Multiple Fern deprecations resolve to generated TypeScript symbol ${symbol}`,
      );
    }
    generatedSymbols.add(symbol);
  }

  return deprecations;
}

function occurrenceCount(contents: string, value: string): number {
  return contents.split(value).length - 1;
}

function leadingJsDoc(
  contents: string,
  declarationStart: number,
  indent: string,
  label: string,
): { start: number; end: number; contents: string } {
  const prefix = contents.slice(0, declarationStart);
  const docStart = prefix.lastIndexOf(`${indent}/**`);
  if (docStart < 0) {
    throw new Error(`${label}: generated declaration has no JSDoc`);
  }

  const docContents = prefix.slice(docStart);
  const isMultiline =
    docContents.startsWith(`${indent}/**\n`) &&
    docContents.endsWith(`${indent} */\n`);
  const isSingleLine =
    docContents.startsWith(`${indent}/** `) &&
    docContents.endsWith(" */\n") &&
    !docContents.slice(0, -1).includes("\n");
  if (!isMultiline && !isSingleLine) {
    throw new Error(
      `${label}: expected one JSDoc immediately before the generated declaration`,
    );
  }

  return {
    start: docStart,
    end: declarationStart,
    contents: docContents,
  };
}

function patchJsDoc(
  doc: string,
  message: string,
  indent: string,
  label: string,
): { contents: string; changed: boolean } {
  const star = `${indent} *`;
  const canonicalTag = `${star} @deprecated ${message}`;
  const inlinePrefix = `${indent}/** `;
  if (
    doc.startsWith(inlinePrefix) &&
    doc.endsWith(" */\n") &&
    !doc.slice(0, -1).includes("\n")
  ) {
    const inlineContents = doc.slice(inlinePrefix.length, -4);
    const description = inlineContents.startsWith("@deprecated")
      ? []
      : [`${star} ${inlineContents}`, star];
    return {
      contents: [
        `${indent}/**`,
        ...description,
        canonicalTag,
        `${indent} */`,
        "",
      ].join("\n"),
      changed: inlineContents !== `@deprecated ${message}`,
    };
  }

  const tags = [...doc.matchAll(/^([ ]*)\* @deprecated(?:\s+.*)?$/gm)].filter(
    (match) => match[1] === `${indent} `,
  );
  if (tags.length > 1) {
    throw new Error(`${label}: found multiple @deprecated tags`);
  }
  if (tags.length === 1) {
    const tag = tags[0];
    if (tag[0] === canonicalTag) return { contents: doc, changed: false };
    return {
      contents: `${doc.slice(0, tag.index)}${canonicalTag}${doc.slice(tag.index + tag[0].length)}`,
      changed: true,
    };
  }

  const firstTag = [...doc.matchAll(/^([ ]*)\* @/gm)].find(
    (match) => match[1] === `${indent} `,
  );
  if (firstTag?.index !== undefined) {
    return {
      contents: `${doc.slice(0, firstTag.index)}${canonicalTag}\n${star}\n${doc.slice(firstTag.index)}`,
      changed: true,
    };
  }

  const close = doc.lastIndexOf(`${indent} */`);
  if (close < 0) throw new Error(`${label}: malformed generated JSDoc`);
  const beforeClose = doc.slice(0, close);
  const separator = beforeClose.endsWith(`${star}\n`) ? "" : `${star}\n`;
  return {
    contents: `${beforeClose}${separator}${canonicalTag}\n${doc.slice(close)}`,
    changed: true,
  };
}

function replaceJsDoc(
  contents: string,
  jsDoc: ReturnType<typeof leadingJsDoc>,
  message: string,
  indent: string,
  label: string,
): { contents: string; changed: boolean } {
  const patched = patchJsDoc(jsDoc.contents, message, indent, label);
  if (!patched.changed) return { contents, changed: false };
  return {
    contents: `${contents.slice(0, jsDoc.start)}${patched.contents}${contents.slice(jsDoc.end)}`,
    changed: true,
  };
}

function patchEndpointMethod(
  contents: string,
  deprecation: FernTypeScriptEndpointDeprecation,
  clientPath: string,
): { contents: string; changed: boolean } {
  const publicMethods = [
    ...contents.matchAll(/^([ ]+)public ([a-zA-Z_$][\w$]*)\($/gm),
  ].filter((match) => match[2] === deprecation.methodName);
  const privateMethods = [
    ...contents.matchAll(/^([ ]+)private async __([a-zA-Z_$][\w$]*)\($/gm),
  ].filter((match) => match[2] === deprecation.methodName);
  if (publicMethods.length !== 1 || privateMethods.length !== 1) {
    throw new Error(
      `${clientPath}: expected one public ${deprecation.methodName} and one private __${deprecation.methodName} method, found ${publicMethods.length} public and ${privateMethods.length} private`,
    );
  }

  const publicStart = publicMethods[0].index;
  const privateStart = privateMethods[0].index;
  const publicIndent = publicMethods[0][1];
  const privateIndent = privateMethods[0][1];
  if (publicIndent !== privateIndent) {
    throw new Error(
      `${clientPath}: public ${deprecation.methodName} and private __${deprecation.methodName} use different indentation`,
    );
  }
  if (privateStart <= publicStart) {
    throw new Error(
      `${clientPath}: private __${deprecation.methodName} does not follow its public method`,
    );
  }
  const delegation = `this.__${deprecation.methodName}(`;
  if (
    occurrenceCount(contents.slice(publicStart, privateStart), delegation) !== 1
  ) {
    throw new Error(
      `${clientPath}: public ${deprecation.methodName} must delegate exactly once to private __${deprecation.methodName}`,
    );
  }

  const label = `${clientPath}: public ${deprecation.methodName}`;
  return replaceJsDoc(
    contents,
    leadingJsDoc(contents, publicStart, publicIndent, label),
    deprecation.message,
    publicIndent,
    label,
  );
}

function patchProperty(
  contents: string,
  deprecation: FernTypeScriptPropertyDeprecation,
  generatedFilePath: string,
): { contents: string; changed: boolean } {
  const interfaces = [
    ...contents.matchAll(/^export interface ([a-zA-Z_$][\w$]*) \{$/gm),
  ].filter((match) => match[1] === deprecation.typeName);
  if (interfaces.length !== 1) {
    throw new Error(
      `${generatedFilePath}: expected one ${deprecation.typeName} interface, found ${interfaces.length}`,
    );
  }

  const interfaceStart = interfaces[0].index;
  const interfaceEnd = contents.indexOf("\n}", interfaceStart);
  if (interfaceEnd < 0) {
    throw new Error(
      `${generatedFilePath}: could not determine the end of ${deprecation.typeName}`,
    );
  }
  const properties = [
    ...contents
      .slice(interfaceStart, interfaceEnd)
      .matchAll(/^([ ]+)([a-zA-Z_$][\w$]*)\??:/gm),
  ].filter((match) => match[2] === deprecation.propertyName);
  if (properties.length !== 1) {
    throw new Error(
      `${generatedFilePath}: expected one ${deprecation.propertyName} property on ${deprecation.typeName}, found ${properties.length}`,
    );
  }

  const propertyStart = interfaceStart + properties[0].index;
  const propertyIndent = properties[0][1];
  const label = `${generatedFilePath}: ${deprecation.typeName}.${deprecation.propertyName}`;
  return replaceJsDoc(
    contents,
    leadingJsDoc(contents, propertyStart, propertyIndent, label),
    deprecation.message,
    propertyIndent,
    label,
  );
}

export function patchGeneratedTypeScriptDeprecations({
  definitionDirectory,
  apiRoot,
}: PatchOptions): PatchResult {
  const deprecations = getFernTypeScriptDeprecations(definitionDirectory);
  const pendingFiles = new Map<string, PendingFile>();
  let decoratedSymbols = 0;

  for (const deprecation of deprecations) {
    const generatedFilePath = path.join(apiRoot, deprecation.generatedPath);
    const pendingFile =
      pendingFiles.get(generatedFilePath) ??
      (() => {
        const contents = fs.readFileSync(generatedFilePath, "utf8");
        return { originalContents: contents, contents };
      })();
    const patched =
      deprecation.kind === "endpoint"
        ? patchEndpointMethod(
            pendingFile.contents,
            deprecation,
            generatedFilePath,
          )
        : patchProperty(pendingFile.contents, deprecation, generatedFilePath);

    if (patched.changed) decoratedSymbols += 1;
    pendingFile.contents = patched.contents;
    pendingFiles.set(generatedFilePath, pendingFile);
  }

  let changedFiles = 0;
  for (const [generatedFilePath, pendingFile] of pendingFiles) {
    if (pendingFile.contents === pendingFile.originalContents) continue;
    fs.writeFileSync(generatedFilePath, pendingFile.contents);
    changedFiles += 1;
  }

  return { changedFiles, decoratedSymbols };
}

function main(): void {
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

  const result = patchGeneratedTypeScriptDeprecations({
    definitionDirectory: path.resolve(values["definition-root"]),
    apiRoot: path.resolve(values["api-root"]),
  });
  console.log(
    result.changedFiles === 0
      ? "No TypeScript SDK deprecation patch needed."
      : `Patched ${result.decoratedSymbols} TypeScript SDK symbols across ${result.changedFiles} generated files.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
