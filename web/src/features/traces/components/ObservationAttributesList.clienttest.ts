// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildModelParameters,
  buildObservationAttributes,
} from "./ObservationAttributesList";

describe("buildObservationAttributes", () => {
  it("adds session and user after the fixed keys and skips empty values", () => {
    const attributes = buildObservationAttributes({
      model: "gpt-4.1-mini",
      environment: "prod",
      release: null,
      version: "v7",
      sessionId: "s42",
      userId: null,
    });
    expect(Object.keys(attributes)).toEqual([
      "model",
      "environment",
      "version",
      "session_id",
    ]);
    expect(attributes.session_id).toBe("s42");
  });

  it("is empty when the observation carries none of the keys", () => {
    expect(
      buildObservationAttributes({
        model: null,
        environment: null,
        release: null,
        version: null,
      }),
    ).toEqual({});
  });
});

describe("buildModelParameters", () => {
  it("keeps the call's parameters as their own table and drops empty ones", () => {
    expect(
      buildModelParameters({ temperature: 0.2, top_p: null, tools: ["a"] }),
    ).toEqual({ temperature: 0.2, tools: ["a"] });
    expect(buildModelParameters({})).toBeNull();
    expect(buildModelParameters(null)).toBeNull();
    expect(buildModelParameters("gpt-4" as unknown as null)).toBeNull();
  });
});
