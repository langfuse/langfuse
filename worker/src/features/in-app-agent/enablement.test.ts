import { afterEach, describe, expect, it, vi } from "vitest";

import { isInAppAgentWorkerSurfaceEnabled } from "./enablement";

const mocks = vi.hoisted(() => ({
  instanceEnabled: true,
}));

vi.mock("@langfuse/shared/in-app-agent/server/modelProvider", () => ({
  isInAppAgentInstanceEnabled: () => mocks.instanceEnabled,
}));

afterEach(() => {
  mocks.instanceEnabled = true;
});

describe("isInAppAgentWorkerSurfaceEnabled", () => {
  it("follows the instance switch when the override is unset", () => {
    expect(isInAppAgentWorkerSurfaceEnabled(undefined)).toBe(true);
  });

  it("opts out when the override is false even if the instance is on", () => {
    expect(isInAppAgentWorkerSurfaceEnabled("false")).toBe(false);
  });

  it("stays off when the instance is off even if the override is true", () => {
    mocks.instanceEnabled = false;

    expect(isInAppAgentWorkerSurfaceEnabled("true")).toBe(false);
  });
});
