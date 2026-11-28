import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type FernAvailability =
  | string
  | {
      status?: string;
      message?: string;
    };

type FernDefinition = {
  "base-path"?: string;
  types?: Record<
    string,
    | string
    | {
        properties?: FernProperties;
        "extra-properties"?: boolean;
        type?: string;
        validation?: { min?: number; max?: number };
      }
  >;
  service?: {
    "base-path"?: string;
    endpoints?: Record<
      string,
      {
        availability?: FernAvailability;
        "base-path"?: string;
        method?: string;
        path?: string;
        request?: string | { body?: string | { properties?: FernProperties } };
      }
    >;
  };
};

export type DeprecatedOperation = {
  method: string;
  endpointPath: string;
  /**
   * Customer-facing explanation of what to use instead. Rendered as Markdown,
   * so example calls need backticks or a `<placeholder>` is read as an HTML tag
   * and disappears from the API reference.
   */
  message: string;
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

function readMessage(availability: FernAvailability | undefined): string {
  const message =
    typeof availability === "object" ? (availability.message ?? "") : "";
  // The message is folded into one line of the OpenAPI description.
  return message.replace(/\s+/g, " ").trim();
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

    return Object.entries(service.endpoints).flatMap(([name, endpoint]) => {
      if (!isDeprecated(endpoint.availability)) return [];
      if (!endpoint.method || endpoint.path === undefined) {
        throw new Error(
          `Deprecated endpoint in ${definitionPath} must define method and path`,
        );
      }

      const message = readMessage(endpoint.availability);
      if (!message) {
        throw new Error(
          `Deprecated endpoint "${name}" in ${definitionPath} must define availability.message, which is what API consumers read in the reference`,
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
          message,
        },
      ];
    });
  });
}

/** getFernDeprecatedProperties locates named-type and inline-request properties in the exported schema. */
export function getFernDeprecatedProperties(
  definitionDirectory: string,
): string[][] {
  const apiDefinition = parse(
    fs.readFileSync(path.join(definitionDirectory, "api.yml"), "utf8"),
  ) as FernDefinition;

  return listYamlFiles(definitionDirectory).flatMap((definitionPath) => {
    const definition = parse(
      fs.readFileSync(definitionPath, "utf8"),
    ) as FernDefinition;
    const namespace = path
      .relative(definitionDirectory, path.dirname(definitionPath))
      .split(path.sep)
      .join("");
    const typeProperties = Object.entries(definition.types ?? {}).flatMap(
      ([name, type]) =>
        deprecatedPropertyPaths(
          typeof type === "string" ? undefined : type.properties,
          ["components", "schemas", `${namespace}${name}`, "properties"],
        ),
    );
    const service = definition.service;
    const requestProperties = Object.values(service?.endpoints ?? {}).flatMap(
      (endpoint) => {
        const request = endpoint.request;
        const body = typeof request === "object" ? request.body : undefined;
        if (typeof body !== "object" || !endpoint.method) return [];
        return deprecatedPropertyPaths(body.properties, [
          "paths",
          joinApiPath(
            apiDefinition["base-path"],
            service?.["base-path"],
            endpoint["base-path"],
            endpoint.path,
          ),
          endpoint.method.toLowerCase(),
          "requestBody",
          "content",
          "application/json",
          "schema",
          "properties",
        ]);
      },
    );
    return [...typeProperties, ...requestProperties];
  });
}

export type FernTypeConstraint =
  | { path: string[]; key: "additionalProperties"; value: false }
  | { path: string[]; key: "enum"; value: number[] };

/** The Fern exporter omits closed objects and bounds on integer aliases. */
export function getFernTypeConstraints(
  definitionDirectory: string,
): FernTypeConstraint[] {
  return listYamlFiles(definitionDirectory).flatMap((definitionPath) => {
    const definition = parse(
      fs.readFileSync(definitionPath, "utf8"),
    ) as FernDefinition;
    const namespace = path
      .relative(definitionDirectory, path.dirname(definitionPath))
      .split(path.sep)
      .join("");
    return Object.entries(definition.types ?? {}).flatMap<FernTypeConstraint>(
      ([name, type]) => {
        if (typeof type !== "object") return [];
        const path = ["components", "schemas", `${namespace}${name}`];
        if (type["extra-properties"] === false)
          return [{ path, key: "additionalProperties", value: false }];
        const fixed = type.validation?.min;
        if (
          type.type === "integer" &&
          fixed !== undefined &&
          Number.isInteger(fixed) &&
          fixed === type.validation?.max
        )
          return [{ path, key: "enum", value: [fixed] }];
        return [];
      },
    );
  });
}

function deprecatedPropertyPaths(
  properties: FernProperties | undefined,
  prefix: string[],
): string[][] {
  return Object.entries(properties ?? {}).flatMap(([name, property]) =>
    typeof property === "object" && isDeprecated(property.availability)
      ? [[...prefix, name]]
      : [],
  );
}

type FernProperties = Record<
  string,
  string | { availability?: FernAvailability }
>;
