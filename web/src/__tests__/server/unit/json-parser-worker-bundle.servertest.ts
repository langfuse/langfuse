import { createContext, runInContext } from "node:vm";

import {
  buildWorkerSourceModule,
  GENERATED_FILE,
} from "../../../../scripts/build-json-parser-worker.mjs";
import { JSON_PARSER_WORKER_SOURCE } from "@/src/workers/generated/json-parser.worker.source";
import type {
  ParseRequest,
  ParseResponse,
} from "@/src/workers/json-parser.protocol";
import { readFileSync } from "node:fs";

/**
 * The parse worker is bundled at build time into a committed string module and
 * started from a blob, so that it has no URL that can 404 after a deploy. Two
 * things have to hold for that to be safe:
 *
 *  - the committed bundle is what the current sources produce, and
 *  - the bundle actually runs with nothing but a Worker global scope.
 */
describe("JSON parser worker bundle", () => {
  it("is what a fresh build of the current sources produces", async () => {
    const fresh = await buildWorkerSourceModule();
    const committed = readFileSync(GENERATED_FILE, "utf8");

    expect(
      fresh === committed
        ? ""
        : `${GENERATED_FILE} is stale. Regenerate it with: pnpm --filter web run build:json-parser-worker`,
    ).toBe("");
  });

  it("carries the header that keeps people from editing it by hand", () => {
    expect(readFileSync(GENERATED_FILE, "utf8")).toContain(
      "GENERATED FILE — DO NOT EDIT",
    );
  });

  it("is self-contained, so nothing can 404 under it", () => {
    // `importScripts` is exactly how the bundler-chunked version failed: the
    // worker bootstrap loaded and then fetched chunks that no longer existed.
    expect(JSON_PARSER_WORKER_SOURCE).not.toContain("importScripts(");
    expect(JSON_PARSER_WORKER_SOURCE).not.toContain("require(");
    // The 1MB `@langfuse/shared` barrel is what forced the chunk split.
    expect(JSON_PARSER_WORKER_SOURCE.length).toBeLessThan(50_000);
  });

  /** Run the bundle with only the globals a dedicated worker really has. */
  function startWorker() {
    const posted: ParseResponse[] = [];
    const scope = {
      self: {
        onmessage: null as ((event: { data: ParseRequest }) => void) | null,
        postMessage: (response: ParseResponse) => posted.push(response),
      },
      performance,
    };
    runInContext(JSON_PARSER_WORKER_SOURCE, createContext(scope));
    expect(scope.self.onmessage).toBeTypeOf("function");

    return {
      posted,
      send: (request: ParseRequest) =>
        scope.self.onmessage?.({ data: request }),
    };
  }

  it("parses nested JSON strings the way the main thread would", () => {
    const worker = startWorker();

    worker.send({
      id: "req-1",
      input: JSON.stringify({ tool: JSON.stringify({ depth: 2 }) }),
      output: "[1,2,3]",
      metadata: null,
    });

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({
      id: "req-1",
      parsedInput: { tool: { depth: 2 } },
      parsedOutput: [1, 2, 3],
      parsedMetadata: null,
    });
    expect(worker.posted[0]!.error).toBeUndefined();
  });

  it("answers with the raw payload when a parse throws, never silently", () => {
    const worker = startWorker();
    const exploding = {
      get boom(): never {
        throw new Error("payload blew up");
      },
    };

    worker.send({
      id: "req-2",
      input: exploding,
      output: null,
      metadata: null,
    });

    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]!.id).toBe("req-2");
    // `toContain`, not equality: an Error crossing the vm realm boundary is not
    // `instanceof Error` inside it, so the worker stringifies it instead.
    expect(worker.posted[0]!.error).toContain("payload blew up");
    // Identity, not deep equality: reading the getter is what throws.
    expect(worker.posted[0]!.parsedInput).toBe(exploding);
  });
});
