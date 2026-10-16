import { afterEach, describe, expect, it, vi } from "vitest";

import { isBaseError } from "../errors";

type ModelDefinitionsModule = typeof import("./modelDefinitions.js");

// The switch is read through the env module, which validates once at import,
// so each case rebuilds the module graph with the flag already in place.
const loadWith = async (
  value: string | undefined,
): Promise<ModelDefinitionsModule> => {
  vi.stubEnv("LANGFUSE_MODEL_DEFINITIONS_ENABLED", value);
  vi.resetModules();
  return import("./modelDefinitions.js");
};

describe("model definitions switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is on when unset, so existing deployments keep resolving models", async () => {
    const { isModelDefinitionsEnabled, assertModelDefinitionsEnabled } =
      await loadWith(undefined);

    expect(isModelDefinitionsEnabled()).toBe(true);
    expect(() => assertModelDefinitionsEnabled()).not.toThrow();
  });

  it('is on for "true"', async () => {
    const { isModelDefinitionsEnabled } = await loadWith("true");

    expect(isModelDefinitionsEnabled()).toBe(true);
  });

  it('is off for "false"', async () => {
    const { isModelDefinitionsEnabled } = await loadWith("false");

    expect(isModelDefinitionsEnabled()).toBe(false);
  });

  // The status code is load-bearing: both the REST and tRPC error handlers
  // replace the message of a 5xx and treat it as an unexpected fault, so a
  // deliberately disabled capability has to report in the 4xx range to reach
  // the caller intact.
  it("rejects with a 4xx carrying the reason when off", async () => {
    const { assertModelDefinitionsEnabled } = await loadWith("false");

    // Duck-typed rather than instanceof: resetModules gives the module under
    // test its own copy of the error classes, which no longer match the ones
    // imported here — the same reason withMiddlewares uses isBaseError.
    try {
      assertModelDefinitionsEnabled();
      expect.unreachable("expected the guard to throw");
    } catch (error) {
      expect(isBaseError(error)).toBe(true);
      const thrown = error as {
        name: string;
        httpCode: number;
        message: string;
        isUserError: () => boolean;
      };
      expect(thrown.name).toBe("ForbiddenError");
      expect(thrown.httpCode).toBe(403);
      expect(thrown.isUserError()).toBe(true);
      expect(thrown.message).toContain(
        "LANGFUSE_MODEL_DEFINITIONS_ENABLED=false",
      );
    }
  });
});
