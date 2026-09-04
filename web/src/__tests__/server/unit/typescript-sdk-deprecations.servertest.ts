import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getFernTypeScriptDeprecations,
  patchGeneratedTypeScriptDeprecations,
} from "../../../../scripts/typescript-sdk/patch-generated-deprecations";

const DEFINITION = `service:
  endpoints:
    getThing:
      availability:
        status: deprecated
        message: "Use getNewThing()  instead."
      method: GET
      path: /widgets/{widgetId}
      request:
        name: GetThingRequest
        body:
          properties:
            password:
              docs: Accepted for compatibility.
              type: optional<string>
              availability:
                status: deprecated
                message: This field is ignored; use SSO instead.
    listThings:
      availability:
        status: deprecated
        message: Use listNewThings() instead.
      method: GET
      path: /widgets
`;

const GENERATED_CLIENT = `export class GeneratedClient {
    /**
     * Get a thing.
     *
     * @param request Generated request.
     */
    public getThing(
        request?: unknown,
    ): core.HttpResponsePromise<unknown> {
        return core.HttpResponsePromise.fromPromise(this.__getThing(request));
    }

    private async __getThing(
        request?: unknown,
    ): Promise<core.WithRawResponse<unknown>> {
        return { data: request, rawResponse: undefined };
    }

    /**
     * List things.
     */
    public listThings(
        request?: unknown,
    ): core.HttpResponsePromise<unknown> {
        return core.HttpResponsePromise.fromPromise(this.__listThings(request));
    }

    private async __listThings(
        request?: unknown,
    ): Promise<core.WithRawResponse<unknown>> {
        return { data: request, rawResponse: undefined };
    }
}
`;

const GENERATED_REQUEST = `export interface GetThingRequest {
    /** Existing password docs. */
    password?: string;
}
`;

type Fixture = {
  definitionDirectory: string;
  apiRoot: string;
  clientPath: string;
  requestPath: string;
};

function withFixture(
  definition: string,
  assertions: (fixture: Fixture) => void,
): void {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "typescript-sdk-deprecations-"),
  );
  const definitionDirectory = path.join(root, "definition");
  const apiRoot = path.join(root, "generated");
  const resourceRoot = path.join(apiRoot, "api/resources/widgetService");
  const clientPath = path.join(resourceRoot, "client/Client.ts");
  const requestPath = path.join(
    resourceRoot,
    "client/requests/GetThingRequest.ts",
  );

  try {
    fs.mkdirSync(definitionDirectory, { recursive: true });
    fs.mkdirSync(path.dirname(clientPath), { recursive: true });
    fs.mkdirSync(path.dirname(requestPath), { recursive: true });
    fs.writeFileSync(path.join(definitionDirectory, "api.yml"), "name: api\n");
    fs.writeFileSync(
      path.join(definitionDirectory, "widget-service.yml"),
      definition,
    );
    fs.writeFileSync(clientPath, GENERATED_CLIENT);
    fs.writeFileSync(requestPath, GENERATED_REQUEST);

    assertions({ definitionDirectory, apiRoot, clientPath, requestPath });
  } finally {
    fs.rmSync(root, { recursive: true });
  }
}

describe("TypeScript SDK deprecations", () => {
  it("maps all current Fern endpoint and property deprecations", () => {
    const definitionDirectory = path.resolve(
      process.cwd(),
      "../fern/apis/server/definition",
    );
    const deprecations = getFernTypeScriptDeprecations(definitionDirectory);

    expect(
      deprecations
        .filter((entry) => entry.kind === "endpoint")
        .map(
          ({ generatedPath, methodName }) =>
            `${generatedPath.replaceAll(path.sep, "/")}:${methodName}`,
        ),
    ).toEqual([
      "api/resources/datasetRunItems/client/Client.ts:create",
      "api/resources/datasetRunItems/client/Client.ts:list",
      "api/resources/datasets/client/Client.ts:getRun",
      "api/resources/datasets/client/Client.ts:deleteRun",
      "api/resources/datasets/client/Client.ts:getRuns",
      "api/resources/ingestion/client/Client.ts:batch",
      "api/resources/legacy/resources/metricsV1/client/Client.ts:metrics",
      "api/resources/legacy/resources/observationsV1/client/Client.ts:get",
      "api/resources/legacy/resources/observationsV1/client/Client.ts:getMany",
      "api/resources/scores/client/Client.ts:getMany",
      "api/resources/scores/client/Client.ts:getById",
      "api/resources/sessions/client/Client.ts:list",
      "api/resources/sessions/client/Client.ts:get",
      "api/resources/trace/client/Client.ts:get",
      "api/resources/trace/client/Client.ts:list",
      "api/resources/unstable/resources/evaluationRules/client/Client.ts:create",
      "api/resources/unstable/resources/evaluationRules/client/Client.ts:list",
      "api/resources/unstable/resources/evaluationRules/client/Client.ts:get",
      "api/resources/unstable/resources/evaluationRules/client/Client.ts:update",
      "api/resources/unstable/resources/evaluationRules/client/Client.ts:delete",
      "api/resources/unstable/resources/evaluators/client/Client.ts:create",
      "api/resources/unstable/resources/evaluators/client/Client.ts:list",
      "api/resources/unstable/resources/evaluators/client/Client.ts:get",
      "api/resources/unstable/resources/evaluators/client/Client.ts:delete",
    ]);
    expect(
      deprecations
        .filter((entry) => entry.kind === "property")
        .map(
          ({ generatedPath, typeName, propertyName }) =>
            `${generatedPath.replaceAll(path.sep, "/")}:${typeName}.${propertyName}`,
        ),
    ).toEqual([
      "api/resources/scim/client/requests/CreateUserRequest.ts:CreateUserRequest.password",
    ]);
  });

  it("patches exact messages across one shared client and is byte-idempotent", () => {
    withFixture(
      DEFINITION,
      ({ definitionDirectory, apiRoot, clientPath, requestPath }) => {
        expect(
          patchGeneratedTypeScriptDeprecations({
            definitionDirectory,
            apiRoot,
          }),
        ).toEqual({ changedFiles: 2, decoratedSymbols: 3 });

        const client = fs.readFileSync(clientPath, "utf8");
        const request = fs.readFileSync(requestPath, "utf8");
        expect(client.match(/@deprecated/g)).toHaveLength(2);
        expect(client).toContain("@deprecated Use getNewThing()  instead.");
        expect(client).toContain("@deprecated Use listNewThings() instead.");
        expect(request).toContain(
          [
            "    /**",
            "     * Existing password docs.",
            "     *",
            "     * @deprecated This field is ignored; use SSO instead.",
            "     */",
            "    password?: string;",
          ].join("\n"),
        );

        expect(
          patchGeneratedTypeScriptDeprecations({
            definitionDirectory,
            apiRoot,
          }),
        ).toEqual({ changedFiles: 0, decoratedSymbols: 0 });
        expect(fs.readFileSync(clientPath, "utf8")).toBe(client);
        expect(fs.readFileSync(requestPath, "utf8")).toBe(request);
      },
    );
  });

  it("fails closed for missing, multiline, and unsupported messages", () => {
    withFixture(
      DEFINITION.replace(
        '        message: "Use getNewThing()  instead."\n',
        "",
      ),
      ({ definitionDirectory }) => {
        expect(() =>
          getFernTypeScriptDeprecations(definitionDirectory),
        ).toThrow(/must define availability\.message/);
      },
    );

    withFixture(
      DEFINITION.replace(
        '        message: "Use getNewThing()  instead."',
        [
          "        message: |-",
          "          Use getNewThing() instead.",
          "          See the migration guide.",
        ].join("\n"),
      ),
      ({ definitionDirectory }) => {
        expect(() =>
          getFernTypeScriptDeprecations(definitionDirectory),
        ).toThrow(/must use a single-line availability\.message/);
      },
    );

    withFixture(
      `${DEFINITION}\ntypes:\n  Widget:\n    properties:\n      oldValue:\n        type: optional<string>\n        availability:\n          status: deprecated\n          message: Use the current value.\n`,
      ({ definitionDirectory }) => {
        expect(() =>
          getFernTypeScriptDeprecations(definitionDirectory),
        ).toThrow(/Unsupported deprecated availability/);
      },
    );
  });

  it("does not partially write when a generated target is incomplete", () => {
    withFixture(
      DEFINITION,
      ({ definitionDirectory, apiRoot, clientPath, requestPath }) => {
        const incompleteRequest = GENERATED_REQUEST.replace(
          "    password?: string;",
          "    anotherField?: string;",
        );
        fs.writeFileSync(requestPath, incompleteRequest);

        expect(() =>
          patchGeneratedTypeScriptDeprecations({
            definitionDirectory,
            apiRoot,
          }),
        ).toThrow(/expected one password property/);
        expect(fs.readFileSync(clientPath, "utf8")).toBe(GENERATED_CLIENT);
        expect(fs.readFileSync(requestPath, "utf8")).toBe(incompleteRequest);
      },
    );
  });
});
