import fs from "node:fs";
import path from "node:path";
import { isMap, parse, parseDocument } from "yaml";

type FernAvailability =
  | string
  | {
      status?: string;
    };

type FernEndpoint = {
  availability?: FernAvailability;
  "base-path"?: string;
  method?: string;
  path?: string;
};

type FernDefinition = {
  service?: {
    "base-path"?: string;
    endpoints?: Record<string, FernEndpoint>;
  };
};

const webDirectory = process.cwd();
const definitionDirectory = path.resolve(
  webDirectory,
  "../fern/apis/server/definition",
);
const openApiPath = path.resolve(
  webDirectory,
  "public/generated/api/openapi.yml",
);

function listYamlFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return listYamlFiles(entryPath);
    if (entry.isFile() && /\.ya?ml$/.test(entry.name)) return [entryPath];
    return [];
  });
}

function joinApiPath(...parts: Array<string | undefined>): string {
  return `/${parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/")}`;
}

function isDeprecated(availability: FernAvailability | undefined): boolean {
  return (
    availability === "deprecated" ||
    (typeof availability === "object" && availability?.status === "deprecated")
  );
}

function getDeprecatedOperations(): Array<{
  method: string;
  endpointPath: string;
}> {
  return listYamlFiles(definitionDirectory).flatMap((definitionPath) => {
    const definition = parse(
      fs.readFileSync(definitionPath, "utf8"),
    ) as FernDefinition;
    const service = definition.service;

    if (!service?.endpoints) return [];

    return Object.values(service.endpoints).flatMap((endpoint) => {
      if (!isDeprecated(endpoint.availability)) return [];
      if (!endpoint.method || !endpoint.path) {
        throw new Error(
          `Deprecated endpoint in ${definitionPath} must define method and path`,
        );
      }

      return [
        {
          method: endpoint.method.toLowerCase(),
          endpointPath: joinApiPath(
            service["base-path"],
            endpoint["base-path"],
            endpoint.path,
          ),
        },
      ];
    });
  });
}

let openApiSource = fs.readFileSync(openApiPath, "utf8");
const openApi = parseDocument(openApiSource);

if (openApi.errors.length > 0) {
  throw new Error(openApi.errors.map((error) => error.message).join("\n"));
}

const deprecatedOperations = getDeprecatedOperations();
const insertions: Array<{ offset: number; value: string }> = [];

for (const { method, endpointPath } of deprecatedOperations) {
  const operationPath = ["paths", endpointPath, method];
  const operation = openApi.getIn(operationPath, true);

  if (!isMap(operation)) {
    throw new Error(
      `OpenAPI schema does not contain ${method.toUpperCase()} ${endpointPath}`,
    );
  }

  const deprecated = operation.get("deprecated");
  if (deprecated === true) continue;
  if (deprecated !== undefined) {
    throw new Error(
      `${method.toUpperCase()} ${endpointPath} has an invalid deprecated value`,
    );
  }
  if (!operation.range) {
    throw new Error(
      `Cannot locate ${method.toUpperCase()} ${endpointPath} in the OpenAPI source`,
    );
  }

  const operationLineStart =
    openApiSource.lastIndexOf("\n", operation.range[0]) + 1;
  const insertionOffset =
    openApiSource.lastIndexOf("\n", operation.range[1] - 1) + 1;
  const indentation = openApiSource.slice(
    operationLineStart,
    operation.range[0],
  );
  insertions.push({
    offset: insertionOffset,
    value: `${indentation}deprecated: true\n`,
  });
}

for (const { offset, value } of insertions.sort(
  (left, right) => right.offset - left.offset,
)) {
  openApiSource = `${openApiSource.slice(0, offset)}${value}${openApiSource.slice(offset)}`;
}

fs.writeFileSync(openApiPath, openApiSource);
console.log(
  `Ensured ${deprecatedOperations.length} deprecated OpenAPI operations match Fern definitions.`,
);
