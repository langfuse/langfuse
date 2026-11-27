import { describe, expect, it, vi } from "vitest";

import { prepareEvaluatorMetadataForSave } from "./prepareEvaluatorMetadataForSave";

describe("prepareEvaluatorMetadataForSave", () => {
  it("generates both missing fields concurrently", async () => {
    const generateName = vi.fn().mockResolvedValue("  Quality judge  ");
    const generateDescription = vi
      .fn()
      .mockResolvedValue("  Scores response quality.  ");
    const setName = vi.fn();
    const setDescription = vi.fn();

    await expect(
      prepareEvaluatorMetadataForSave({
        currentName: "",
        currentDescription: "",
        generateName,
        generateDescription,
        setName,
        setDescription,
      }),
    ).resolves.toEqual({
      name: "Quality judge",
      description: "Scores response quality.",
    });
    expect(generateName).toHaveBeenCalledOnce();
    expect(generateDescription).toHaveBeenCalledOnce();
    expect(setName).toHaveBeenCalledWith("Quality judge");
    expect(setDescription).toHaveBeenCalledWith("Scores response quality.");
  });

  it("continues with a generated name when no description is returned", async () => {
    const generateName = vi.fn().mockResolvedValue("Quality judge");
    const generateDescription = vi.fn().mockResolvedValue(null);
    const setName = vi.fn();
    const setDescription = vi.fn();

    await expect(
      prepareEvaluatorMetadataForSave({
        currentName: "",
        currentDescription: "",
        generateName,
        generateDescription,
        setName,
        setDescription,
      }),
    ).resolves.toEqual({
      name: "Quality judge",
      description: null,
    });
    expect(generateName).toHaveBeenCalledOnce();
    expect(generateDescription).toHaveBeenCalledOnce();
    expect(setName).toHaveBeenCalledWith("Quality judge");
    expect(setDescription).not.toHaveBeenCalled();
  });

  it("requires a name when generation returns nothing", async () => {
    const generateName = vi.fn().mockResolvedValue(null);
    const setName = vi.fn();
    const setDescription = vi.fn();

    await expect(
      prepareEvaluatorMetadataForSave({
        currentName: "",
        currentDescription: "",
        generateName,
        generateDescription: null,
        setName,
        setDescription,
      }),
    ).resolves.toBeNull();
    expect(generateName).toHaveBeenCalledOnce();
    expect(setName).not.toHaveBeenCalled();
    expect(setDescription).not.toHaveBeenCalled();
  });

  it("fills only missing metadata without overwriting existing text", async () => {
    const generateName = vi.fn().mockResolvedValue("Generated name");
    const generateDescription = vi
      .fn()
      .mockResolvedValue("Generated description.");
    const setName = vi.fn();
    const setDescription = vi.fn();

    await expect(
      prepareEvaluatorMetadataForSave({
        currentName: "Existing name",
        currentDescription: "",
        generateName,
        generateDescription,
        setName,
        setDescription,
      }),
    ).resolves.toEqual({
      name: "Existing name",
      description: "Generated description.",
    });
    expect(generateName).not.toHaveBeenCalled();
    expect(generateDescription).toHaveBeenCalledOnce();
    expect(setName).not.toHaveBeenCalled();
    expect(setDescription).toHaveBeenCalledWith("Generated description.");
  });
});
