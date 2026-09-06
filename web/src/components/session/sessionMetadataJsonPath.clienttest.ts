import { describe, expect, it } from "vitest";

import {
  getMetadataJsonPathLabel,
  metadataJsonPathsStorageKey,
  parseStoredMetadataJsonPaths,
  resolveMetadataJsonPath,
} from "@/src/components/session/sessionMetadataJsonPath";
import { getVisibleSessionObservations } from "@/src/components/session/sessionVisibleObservations";

const observation = ({
  id,
  input = null,
  output = null,
}: {
  id: string;
  input?: unknown;
  output?: unknown;
}) => ({
  id,
  metadata: {},
  input,
  output,
  inputLength: typeof input === "string" ? input.length : 0,
  outputLength: typeof output === "string" ? output.length : 0,
});

describe("session metadata JSONPaths", () => {
  it("stores multiple paths and resolves their display values", () => {
    expect(metadataJsonPathsStorageKey("project-1")).toBe(
      "modern-session:metadata-jsonpaths:v1:project-1",
    );
    expect(
      parseStoredMetadataJsonPaths([" $.email ", "$.cloud_region", "$.email"]),
    ).toEqual(["$.email", "$.cloud_region"]);
    expect(parseStoredMetadataJsonPaths({ paths: ["$.email"] })).toEqual([]);

    const metadata = JSON.stringify({
      email: "danielm@nexite.io",
      admin: false,
      tags: ["production", "agent"],
    });
    expect(resolveMetadataJsonPath(metadata, "$.email")).toEqual({
      state: "match",
      displayValue: "danielm@nexite.io",
    });
    expect(resolveMetadataJsonPath(metadata, "$.admin")).toEqual({
      state: "match",
      displayValue: "false",
    });
    expect(resolveMetadataJsonPath(metadata, "$.tags")).toEqual({
      state: "match",
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

  it("normalizes the row response and returns exactly its rendered observations", () => {
    const synthetic = observation({ id: "t-trace-1", input: "trace input" });
    const firstReal = observation({ id: "observation-1", output: "answer" });
    expect(
      getVisibleSessionObservations(
        { observations: [synthetic, firstReal] },
        "trace-1",
      ).visibleObservations,
    ).toEqual([synthetic, firstReal]);

    const capped = Array.from({ length: 51 }, (_, index) =>
      observation({ id: `observation-${index + 1}` }),
    );
    expect(getVisibleSessionObservations(capped, "trace-1")).toEqual({
      visibleObservations: capped.slice(0, 50),
      hasMoreObservations: true,
    });
    expect(getVisibleSessionObservations(undefined, "trace-1")).toEqual({
      visibleObservations: undefined,
      hasMoreObservations: false,
    });
  });
});
