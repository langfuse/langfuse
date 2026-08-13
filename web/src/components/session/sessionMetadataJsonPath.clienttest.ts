import { describe, expect, it, vi } from "vitest";

import {
  findFirstVisibleSessionObservation,
  getMetadataJsonPathLabel,
  metadataJsonPathsStorageKey,
  parseStoredMetadataJsonPaths,
  resolveMetadataJsonPath,
} from "@/src/components/session/sessionMetadataJsonPath";
import {
  getVisibleSessionObservations,
  normalizeSessionObservationsResponse,
} from "@/src/components/session/sessionVisibleObservations";

const observation = ({
  id,
  metadata = {},
  input = null,
  output = null,
}: {
  id: string;
  metadata?: unknown;
  input?: unknown;
  output?: unknown;
}) => ({
  id,
  metadata,
  input,
  output,
  inputLength: typeof input === "string" ? input.length : 0,
  outputLength: typeof output === "string" ? output.length : 0,
});

describe("sessionMetadataJsonPath", () => {
  it("resolves and labels metadata JSONPaths", () => {
    const metadata = JSON.stringify({
      email: "danielm@nexite.io",
      admin: false,
      tags: ["production", "agent"],
    });

    expect(resolveMetadataJsonPath(metadata, "$.email")).toEqual({
      state: "match",
      value: "danielm@nexite.io",
      displayValue: "danielm@nexite.io",
    });
    expect(resolveMetadataJsonPath(metadata, "$.admin")).toEqual({
      state: "match",
      value: false,
      displayValue: "false",
    });
    expect(resolveMetadataJsonPath(metadata, "$.tags")).toEqual({
      state: "match",
      value: ["production", "agent"],
      displayValue: '["production","agent"]',
    });
    expect(resolveMetadataJsonPath({}, "email")).toEqual({
      state: "invalid",
      message: "JSONPath must start with $.",
    });
    expect(resolveMetadataJsonPath({}, "$.email")).toEqual({
      state: "no-match",
    });
    expect(getMetadataJsonPathLabel("$.langfuse_user_email")).toBe(
      "langfuse_user_email",
    );
    expect(getMetadataJsonPathLabel("$['user.email']")).toBe("user.email");
    expect(getMetadataJsonPathLabel("$[*]")).toBe("$[*]");
  });

  it("validates the multi-path project-local storage value", () => {
    expect(metadataJsonPathsStorageKey("project-1")).toBe(
      "modern-session:metadata-jsonpaths:v1:project-1",
    );
    expect(
      parseStoredMetadataJsonPaths({
        version: 1,
        paths: [" $.email ", "$.cloud_region", "$.email"],
      }),
    ).toEqual({
      version: 1,
      paths: ["$.email", "$.cloud_region"],
    });
    expect(
      parseStoredMetadataJsonPaths({ version: 1, path: "$.email" }),
    ).toBeNull();
  });

  it("selects the first observation actually rendered across traces", async () => {
    const uniqueSynthetic = observation({
      id: "t-trace-1",
      input: "trace input",
    });
    const firstReal = observation({ id: "observation-1", output: "answer" });
    expect(
      getVisibleSessionObservations([uniqueSynthetic, firstReal], "trace-1")
        .visibleObservations,
    ).toEqual([uniqueSynthetic, firstReal]);

    const capped = Array.from({ length: 51 }, (_, index) =>
      observation({ id: `observation-${index + 1}` }),
    );
    expect(getVisibleSessionObservations(capped, "trace-1")).toMatchObject({
      visibleObservations: capped.slice(0, 50),
      hasMoreObservations: true,
    });

    const real = observation({ id: "observation-2", output: "answer" });
    const loadObservations = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({
        observations: [
          observation({ id: "t-trace-2", output: "answer" }),
          real,
        ],
      });

    expect(normalizeSessionObservationsResponse([real])).toEqual([real]);

    const result = await findFirstVisibleSessionObservation({
      traces: [{ id: "trace-1" }, { id: "trace-2" }, { id: "trace-3" }],
      loadObservations,
      signal: new AbortController().signal,
    });

    expect(result).toBe(real);
    expect(loadObservations).toHaveBeenCalledTimes(2);
    expect(loadObservations).toHaveBeenNthCalledWith(1, "trace-1");
    expect(loadObservations).toHaveBeenNthCalledWith(2, "trace-2");
  });
});
