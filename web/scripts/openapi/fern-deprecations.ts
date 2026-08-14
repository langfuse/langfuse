import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type FernAvailability =
  | string
  | {
      status?: string;
    };

type FernDefinition = {
  "base-path"?: string;
  service?: {
    "base-path"?: string;
    endpoints?: Record<
      string,
      {
        availability?: FernAvailability;
        "base-path"?: string;
        method?: string;
        path?: string;
      }
    >;
  };
};

export type DeprecatedOperation = {
  method: string;
  endpointPath: string;
};

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
    (typeof availability === "object" && availability.status === "deprecated")
  );
}

export function getFernDeprecatedOperations(
  definitionDirectory: string,
): DeprecatedOperation[] {
  const apiDefinition = parse(
    fs.readFileSync(path.join(definitionDirectory, "api.yml"), "utf8"),
  ) as FernDefinition;

  return listYamlFiles(definitionDirectory).flatMap((definitionPath) => {
    const definition = parse(
      fs.readFileSync(definitionPath, "utf8"),
    ) as FernDefinition;
    const service = definition.service;

    if (!service?.endpoints) return [];

    return Object.values(service.endpoints).flatMap((endpoint) => {
      if (!isDeprecated(endpoint.availability)) return [];
      if (!endpoint.method || endpoint.path === undefined) {
        throw new Error(
          `Deprecated endpoint in ${definitionPath} must define method and path`,
        );
      }

      return [
        {
          method: endpoint.method.toLowerCase(),
          endpointPath: joinApiPath(
            apiDefinition["base-path"],
            service["base-path"],
            endpoint["base-path"],
            endpoint.path,
          ),
        },
      ];
    });
  });
}
