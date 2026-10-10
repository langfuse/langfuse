import { describe, expect, it, vi } from "vitest";

import { prepareEvaluatorMetadataForSave } from "./prepareEvaluatorMetadataForSave";

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("prepareEvaluatorMetadataForSave", () => {
  it("generates both missing fields concurrently", async () => {
    const name = createDeferred<string | null>();
    const description = createDeferred<string | null>();
    const generateName = vi.fn().mockReturnValue(name.promise);
    const generateDescription = vi.fn().mockReturnValue(description.promise);
    const setName = vi.fn();
    const setDescription = vi.fn();

    const metadata = prepareEvaluatorMetadataForSave({
      currentName: "",
      currentDescription: "",
      generateName,
      generateDescription,
      setName,
      setDescription,
    });

    expect(generateName).toHaveBeenCalledOnce();
    expect(generateDescription).toHaveBeenCalledOnce();
    name.resolve("  Quality judge  ");
    await Promise.resolve();
    expect(setName).not.toHaveBeenCalled();

    description.resolve("  Scores response quality.  ");
    await expect(metadata).resolves.toEqual({
      name: "Quality judge",
      description: "Scores response quality.",
    });
    expect(setName).toHaveBeenCalledWith("Quality judge");
    expect(setDescription).toHaveBeenCalledWith("Scores response quality.");
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

  it("uses a fallback name when an Assistant handoff must persist a draft", async () => {
    const setName = vi.fn();

    await expect(
      prepareEvaluatorMetadataForSave({
        currentName: "",
        currentDescription: "",
        generateName: null,
        generateDescription: null,
        fallbackName: "Draft code evaluator",
        setName,
        setDescription: vi.fn(),
      }),
    ).resolves.toEqual({
      name: "Draft code evaluator",
      description: null,
    });
    expect(setName).toHaveBeenCalledWith("Draft code evaluator");
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
