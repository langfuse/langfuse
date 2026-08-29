import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";

import {
  getFernDeprecatedOperations,
  type DeprecatedOperation,
} from "../../../../scripts/openapi/fern-deprecations";
import {
  deprecationNotice,
  stampDeprecations,
} from "../../../../scripts/openapi/stamp-deprecations";
import {
  V3_SUNSET_DATE,
  V3_SUNSET_HUMAN,
} from "@/src/features/public-api/server/deprecations";

type OpenApiOperation = {
  deprecated?: boolean;
  description?: string;
  security?: unknown;
};
type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

const definitionDirectory = path.resolve(
  process.cwd(),
  "../fern/apis/server/definition",
);
const openApiPath = path.resolve(
  process.cwd(),
  "public/generated/api/openapi.yml",
);

const MESSAGE = "Use `GET /api/public/v2/observations?from=<from>` instead.";
const UNSTABLE_EVALS_SUNSET_HUMAN = "September 4, 2026";
const UNSTABLE_EVAL_OPERATIONS = new Set([
  "POST /api/public/unstable/evaluators",
  "GET /api/public/unstable/evaluators",
  "GET /api/public/unstable/evaluators/{evaluatorId}",
  "DELETE /api/public/unstable/evaluators/{evaluatorId}",
  "POST /api/public/unstable/evaluation-rules",
  "GET /api/public/unstable/evaluation-rules",
  "GET /api/public/unstable/evaluation-rules/{evaluationRuleId}",
  "PATCH /api/public/unstable/evaluation-rules/{evaluationRuleId}",
  "DELETE /api/public/unstable/evaluation-rules/{evaluationRuleId}",
]);

/** Spec fixture in the shape `fern export` produces, aliased `security` included. */
const SPEC = `openapi: 3.0.1
paths:
  /api/public/traces:
    get:
      description: Get list of traces
      operationId: trace_list
      security: &ref_0
        - BasicAuth: []
    post:
      description: Create a trace
      operationId: trace_create
      security: *ref_0
  /api/public/sessions:
    get:
      description: >-
        Get sessions.


        Sessions group traces that belong to one conversation.
      operationId: sessions_list
      security: *ref_0
`;

function operations(
  entries: Array<[string, string, string]>,
): DeprecatedOperation[] {
  return entries.map(([method, endpointPath, message]) => ({
    method,
    endpointPath,
    message,
  }));
}

function parseSpec(source: string): OpenApiDocument {
  return parse(source, { maxAliasCount: -1 }) as OpenApiDocument;
}

function withDefinition(
  files: Record<string, string>,
  assertions: (directory: string) => void,
) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fern-deprecations-"),
  );

  try {
    for (const [name, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(directory, name), contents);
    }
    assertions(directory);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

describe("OpenAPI deprecations", () => {
  it("matches the deprecated endpoints in the Fern definitions", () => {
    const openApi = parseSpec(fs.readFileSync(openApiPath, "utf8"));
    const openApiDeprecatedOperations = Object.entries(openApi.paths).flatMap(
      ([endpointPath, pathItem]) =>
        Object.entries(pathItem).flatMap(([method, operation]) =>
          operation.deprecated ? [`${method} ${endpointPath}`] : [],
        ),
    );

    expect(openApiDeprecatedOperations.sort()).toEqual(
      getFernDeprecatedOperations(definitionDirectory)
        .map(({ method, endpointPath }) => `${method} ${endpointPath}`)
        .sort(),
    );
  });

  it("carries every Fern deprecation message into the operation description", () => {
    const openApi = parseSpec(fs.readFileSync(openApiPath, "utf8"));

    for (const { method, endpointPath, message } of getFernDeprecatedOperations(
      definitionDirectory,
    )) {
      expect(
        openApi.paths[endpointPath][method].description,
        `${method.toUpperCase()} ${endpointPath}`,
      ).toContain(deprecationNotice(message));
    }
  });

  it("states the runtime sunset date in every Fern deprecation message", () => {
    for (const { method, endpointPath, message } of getFernDeprecatedOperations(
      definitionDirectory,
    )) {
      const operation = `${method.toUpperCase()} ${endpointPath}`;
      const sunsetDate = UNSTABLE_EVAL_OPERATIONS.has(operation)
        ? UNSTABLE_EVALS_SUNSET_HUMAN
        : V3_SUNSET_HUMAN;

      expect(message, operation).toContain(`will be removed on ${sunsetDate}.`);
    }
  });

  // The date is a Cloud commitment; self-hosted is not bound by it.
  it("scopes every sunset message to Langfuse Cloud", () => {
    for (const { method, endpointPath, message } of getFernDeprecatedOperations(
      definitionDirectory,
    )) {
      const operation = `${method.toUpperCase()} ${endpointPath}`;
      expect(message, operation).toContain("On Langfuse Cloud,");
      expect(message, operation).toContain(
        "Self-hosted deployments are unaffected",
      );
    }
  });

  it("keeps the human-readable sunset date in sync with the machine-readable one", () => {
    expect(
      new Date(`${V3_SUNSET_DATE}T00:00:00Z`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }),
    ).toBe(V3_SUNSET_HUMAN);
  });

  it("supports deprecated endpoints at a service base path", () => {
    withDefinition(
      {
        "api.yml": "base-path: /api\n",
        "service.yml": [
          "service:",
          "  base-path: /public",
          "  endpoints:",
          "    get:",
          "      availability:",
          "        status: deprecated",
          `        message: "${MESSAGE}"`,
          "      method: GET",
          '      path: ""',
          "",
        ].join("\n"),
      },
      (directory) => {
        expect(getFernDeprecatedOperations(directory)).toEqual([
          { method: "get", endpointPath: "/api/public", message: MESSAGE },
        ]);
      },
    );
  });

  it("refuses a deprecation without a message", () => {
    withDefinition(
      {
        "api.yml": "base-path: /api\n",
        "service.yml": [
          "service:",
          "  endpoints:",
          "    get:",
          "      availability: deprecated",
          "      method: GET",
          "      path: /traces",
          "",
        ].join("\n"),
      },
      (directory) => {
        expect(() => getFernDeprecatedOperations(directory)).toThrow(
          /must define availability.message/,
        );
      },
    );
  });

  it("stamps the flag and the notice, leaving other operations untouched", () => {
    const stamped = stampDeprecations(
      SPEC,
      operations([["get", "/api/public/traces", MESSAGE]]),
    );
    const openApi = parseSpec(stamped);
    const operation = openApi.paths["/api/public/traces"].get;

    expect(operation.deprecated).toBe(true);
    expect(operation.description).toBe(
      `${deprecationNotice(MESSAGE)}\n\nGet list of traces`,
    );

    const untouched = openApi.paths["/api/public/traces"].post;
    expect(untouched.description).toBe("Create a trace");
    expect(untouched.deprecated).toBeUndefined();
    expect(stamped).toContain("      description: Create a trace\n");
  });

  it("keeps the aliased security block intact", () => {
    const stamped = stampDeprecations(
      SPEC,
      operations([["get", "/api/public/traces", MESSAGE]]),
    );

    expect(stamped.match(/security: \*ref_0/g)).toHaveLength(2);
    expect(
      parseSpec(stamped).paths["/api/public/traces"].post.security,
    ).toEqual([{ BasicAuth: [] }]);
  });

  it("preserves the block style and text of a multi-line description", () => {
    const stamped = stampDeprecations(
      SPEC,
      operations([["get", "/api/public/sessions", MESSAGE]]),
    );

    expect(stamped).toContain("      description: >-\n");
    expect(stamped).toContain(
      "        Sessions group traces that belong to one conversation.\n",
    );
    expect(
      parseSpec(stamped).paths["/api/public/sessions"].get.description,
    ).toBe(
      `${deprecationNotice(MESSAGE)}\n\nGet sessions.\n\nSessions group traces that belong to one conversation.`,
    );
  });

  it("keeps a literal description literal instead of folding it", () => {
    const literal = SPEC.replace("description: >-", "description: |-");
    const stamped = stampDeprecations(
      literal,
      operations([["get", "/api/public/sessions", MESSAGE]]),
    );

    expect(stamped).toContain("      description: |-\n");
    expect(
      parseSpec(stamped).paths["/api/public/sessions"].get.description,
    ).toContain(deprecationNotice(MESSAGE));
  });

  it("is idempotent across repeated runs", () => {
    const deprecated = operations([
      ["get", "/api/public/traces", MESSAGE],
      ["get", "/api/public/sessions", MESSAGE],
    ]);
    const once = stampDeprecations(SPEC, deprecated);

    expect(stampDeprecations(once, deprecated)).toBe(once);
  });

  it("replaces an outdated notice instead of stacking a second one", () => {
    const once = stampDeprecations(
      SPEC,
      operations([["get", "/api/public/traces", "Old guidance."]]),
    );
    const twice = stampDeprecations(
      once,
      operations([["get", "/api/public/traces", "New guidance."]]),
    );

    expect(parseSpec(twice).paths["/api/public/traces"].get.description).toBe(
      `${deprecationNotice("New guidance.")}\n\nGet list of traces`,
    );
  });

  it("refuses a description that already opens with a hand-written notice", () => {
    const handWritten = SPEC.replace(
      "description: Get list of traces",
      "description: '**Deprecated.** Use something else.'",
    );

    expect(() =>
      stampDeprecations(
        handWritten,
        operations([["get", "/api/public/traces", MESSAGE]]),
      ),
    ).toThrow(/hand-written deprecation notice/);
  });

  it("fails when a deprecated endpoint has no operation in the spec", () => {
    expect(() =>
      stampDeprecations(
        SPEC,
        operations([["get", "/api/public/does-not-exist", MESSAGE]]),
      ),
    ).toThrow(/does not contain GET \/api\/public\/does-not-exist/);
  });
});
