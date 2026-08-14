import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

import {
  collectDeprecations,
  patchSpec,
} from "./patch-openapi-deprecations.mjs";

const PARSE_OPTIONS = { maxAliasCount: -1 };

const V3_MESSAGE =
  "Langfuse v3 is deprecated; this endpoint will be removed in a future release. Use GET /api/public/v2/observations instead.";

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

function deprecations(entries) {
  return new Map(
    entries.map(([method, operationPath, message]) => [
      `${method} ${operationPath}`,
      {
        method,
        path: operationPath,
        message,
        source: `fixture#${method}`,
      },
    ]),
  );
}

function parse(text) {
  return YAML.parse(text, PARSE_OPTIONS);
}

function withDefinition(files, assertions) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "openapi-deprecations-"),
  );
  try {
    for (const [name, contents] of Object.entries(files)) {
      const file = path.join(directory, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }
    assertions(directory);
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
}

test("reads deprecated endpoints and prefixes the service base path", () => {
  withDefinition(
    {
      "trace.yml": `service:
  base-path: /api/public
  endpoints:
    list:
      availability:
        status: deprecated
        message: "${V3_MESSAGE}"
      method: GET
      path: /traces
    create:
      method: POST
      path: /traces
`,
    },
    (directory) => {
      const { deprecations: found, skipped } = collectDeprecations(directory);

      assert.deepEqual([...found.keys()], ["get /api/public/traces"]);
      assert.equal(found.get("get /api/public/traces").message, V3_MESSAGE);
      assert.deepEqual(skipped, []);
    },
  );
});

test("ignores availability statuses other than deprecated", () => {
  withDefinition(
    {
      "unstable.yml": `service:
  base-path: /api/public
  endpoints:
    list:
      availability:
        status: pre-release
      method: GET
      path: /unstable/widgets
`,
    },
    (directory) => {
      const { deprecations: found, skipped } = collectDeprecations(directory);

      assert.equal(found.size, 0);
      assert.deepEqual(skipped, []);
    },
  );
});

test("reports availability that is not on an endpoint instead of dropping it", () => {
  withDefinition(
    {
      "scim.yml": `service:
  base-path: /api/public/scim
  endpoints:
    createUser:
      method: POST
      path: /Users
      request:
        body:
          properties:
            password:
              type: optional<string>
              availability:
                status: deprecated
                message: This attribute is ignored.
`,
    },
    (directory) => {
      const { deprecations: found, skipped } = collectDeprecations(directory);

      assert.equal(found.size, 0);
      assert.equal(skipped.length, 1);
      assert.equal(skipped[0].count, 1);
      assert.ok(skipped[0].file.endsWith("scim.yml"));
    },
  );
});

test("refuses a deprecation without a message", () => {
  withDefinition(
    {
      "trace.yml": `service:
  base-path: /api/public
  endpoints:
    list:
      availability:
        status: deprecated
      method: GET
      path: /traces
`,
    },
    (directory) => {
      assert.throws(() => collectDeprecations(directory), /without a message/);
    },
  );
});

test("stamps the flag and the notice, leaving other operations untouched", () => {
  const { text, stamped } = patchSpec(
    SPEC,
    deprecations([["get", "/api/public/traces", V3_MESSAGE]]),
  );
  const parsed = parse(text);
  const operation = parsed.paths["/api/public/traces"].get;

  assert.deepEqual(stamped, ["get /api/public/traces"]);
  assert.equal(operation.deprecated, true);
  assert.equal(
    operation.description,
    `**Deprecated:** ${V3_MESSAGE}\n\nGet list of traces`,
  );

  const untouched = parsed.paths["/api/public/traces"].post;
  assert.equal(untouched.description, "Create a trace");
  assert.equal("deprecated" in untouched, false);
  assert.ok(text.includes("      description: Create a trace\n"));
});

test("keeps the aliased security block intact", () => {
  const { text } = patchSpec(
    SPEC,
    deprecations([["get", "/api/public/traces", V3_MESSAGE]]),
  );

  assert.equal(text.match(/security: \*ref_0/g).length, 2);
  assert.deepEqual(parse(text).paths["/api/public/traces"].post.security, [
    { BasicAuth: [] },
  ]);
});

test("preserves the block style and text of a multi-line description", () => {
  const { text } = patchSpec(
    SPEC,
    deprecations([["get", "/api/public/sessions", V3_MESSAGE]]),
  );

  assert.ok(text.includes("      description: >-\n"));
  assert.ok(
    text.includes(
      "        Sessions group traces that belong to one conversation.\n",
    ),
  );
  assert.equal(
    parse(text).paths["/api/public/sessions"].get.description,
    `**Deprecated:** ${V3_MESSAGE}\n\nGet sessions.\n\nSessions group traces that belong to one conversation.`,
  );
});

test("is idempotent across repeated runs", () => {
  const found = deprecations([
    ["get", "/api/public/traces", V3_MESSAGE],
    ["get", "/api/public/sessions", V3_MESSAGE],
  ]);
  const once = patchSpec(SPEC, found);
  const twice = patchSpec(once.text, found);

  assert.equal(twice.text, once.text);
  assert.deepEqual(twice.stamped, []);
  assert.deepEqual(twice.cleared, []);
});

test("replaces an outdated notice instead of stacking a second one", () => {
  const once = patchSpec(
    SPEC,
    deprecations([["get", "/api/public/traces", "Old guidance."]]),
  );
  const twice = patchSpec(
    once.text,
    deprecations([["get", "/api/public/traces", "New guidance."]]),
  );

  assert.equal(
    parse(twice.text).paths["/api/public/traces"].get.description,
    "**Deprecated:** New guidance.\n\nGet list of traces",
  );
});

test("clears a stamp once the endpoint is no longer deprecated in Fern", () => {
  const stamped = patchSpec(
    SPEC,
    deprecations([["get", "/api/public/traces", V3_MESSAGE]]),
  );
  const cleared = patchSpec(stamped.text, new Map());

  assert.deepEqual(cleared.cleared, ["get /api/public/traces"]);
  assert.equal(cleared.text, SPEC);
});

test("fails when a deprecated endpoint has no operation in the spec", () => {
  assert.throws(
    () =>
      patchSpec(
        SPEC,
        deprecations([["get", "/api/public/does-not-exist", V3_MESSAGE]]),
      ),
    /no operation in the exported spec/,
  );
});
