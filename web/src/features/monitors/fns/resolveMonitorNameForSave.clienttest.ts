// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { resolveMonitorNameForSave } from "./resolveMonitorNameForSave";

describe("resolveMonitorNameForSave", () => {
  it("keeps a manually entered name", async () => {
    const generateName = vi.fn();

    await expect(
      resolveMonitorNameForSave({
        name: "Cost spike",
        fallbackName: "Fallback",
        aiAvailable: true,
        generateName,
      }),
    ).resolves.toEqual({ status: "resolved", name: "Cost spike" });
    expect(generateName).not.toHaveBeenCalled();
  });

  it("generates an empty name when AI assistance is available", async () => {
    const generateName = vi.fn().mockResolvedValue("  Evaluator cost spike  ");

    await expect(
      resolveMonitorNameForSave({
        name: "",
        fallbackName: "Fallback",
        aiAvailable: true,
        generateName,
      }),
    ).resolves.toEqual({
      status: "resolved",
      name: "Evaluator cost spike",
    });
  });

  it("uses the deterministic fallback when AI assistance is unavailable", async () => {
    const generateName = vi.fn();

    await expect(
      resolveMonitorNameForSave({
        name: "",
        fallbackName: "Count of observations is above 5",
        aiAvailable: false,
        generateName,
      }),
    ).resolves.toEqual({
      status: "resolved",
      name: "Count of observations is above 5",
    });
    expect(generateName).not.toHaveBeenCalled();
  });

  it("identifies an unsuccessful AI generation", async () => {
    await expect(
      resolveMonitorNameForSave({
        name: "",
        fallbackName: "Fallback",
        aiAvailable: true,
        generateName: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toEqual({ status: "generation-failed" });
  });

  it("identifies a missing local fallback without requesting generation", async () => {
    const generateName = vi.fn();

    await expect(
      resolveMonitorNameForSave({
        name: "",
        fallbackName: "",
        aiAvailable: false,
        generateName,
      }),
    ).resolves.toEqual({ status: "validation-failed" });
    expect(generateName).not.toHaveBeenCalled();
  });
});
