import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canUseBundledWorker } from "./web-workers";

const mocks = vi.hoisted(() => ({
  env: {} as { NEXT_PUBLIC_ASSET_PREFIX?: string },
}));

vi.mock("@/src/env.mjs", () => ({
  env: mocks.env,
}));

describe("canUseBundledWorker", () => {
  // jsdom ships no Worker constructor, so stand one in: every case here is
  // about the asset origin, not about browser capability.
  const workerStub = class {} as unknown as typeof Worker;

  beforeEach(() => {
    mocks.env.NEXT_PUBLIC_ASSET_PREFIX = undefined;
    window.Worker = workerStub;
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "Worker");
  });

  it("allows workers when no asset prefix is configured", () => {
    expect(canUseBundledWorker()).toBe(true);
  });

  it("allows workers when the asset prefix is the page origin itself", () => {
    mocks.env.NEXT_PUBLIC_ASSET_PREFIX = window.location.origin;

    expect(canUseBundledWorker()).toBe(true);
  });

  // The case this guard exists for: Turbopack derives the worker bootstrap URL
  // from the asset prefix and forces a classic worker, so constructing one
  // throws a SecurityError rather than falling back.
  it("blocks workers when build output is served from another origin", () => {
    mocks.env.NEXT_PUBLIC_ASSET_PREFIX = "https://static-staging.langfuse.com";

    expect(canUseBundledWorker()).toBe(false);
  });

  it("blocks workers when the browser has no Worker support", () => {
    Reflect.deleteProperty(window, "Worker");

    expect(canUseBundledWorker()).toBe(false);
  });
});
