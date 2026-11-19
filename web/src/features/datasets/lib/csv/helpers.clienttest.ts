import { describe, expect, it } from "vitest";
import { parseCsvClient, parseValue } from "./helpers";

describe("CSV dataset parsing", () => {
  it("preserves unsafe integer values as strings", () => {
    expect(parseValue("107505301260286111")).toBe("107505301260286111");
    expect(parseValue('{"input_number":107505301260286111}')).toEqual({
      input_number: "107505301260286111",
    });
  });

  it("keeps safe numbers as numbers", () => {
    expect(parseValue("42")).toBe(42);
    expect(parseValue("3.4")).toBe(3.4);
    expect(parseValue('{"safe_number":42}')).toEqual({ safe_number: 42 });
  });

  it("preserves unsafe decimal values as strings", () => {
    expect(parseValue("0.123456789012345678")).toBe("0.123456789012345678");
    expect(parseValue("12345678901234.567")).toBe("12345678901234.567");
    expect(parseValue('{"amount":0.123456789012345678}')).toEqual({
      amount: "0.123456789012345678",
    });
  });

  it("infers unsafe decimal columns as strings", async () => {
    const file = new File(["amount\n0.123456789012345678\n"], "amounts.csv", {
      type: "text/csv",
    });

    const preview = await parseCsvClient(file, {
      isPreview: true,
      collectSamples: true,
    });

    expect(preview.columns[0]).toMatchObject({
      name: "amount",
      inferredType: "string",
    });
  });

  it("keeps case-insensitive boolean fallback behavior", () => {
    expect(parseValue("true")).toBe(true);
    expect(parseValue("FALSE")).toBe(false);
  });

  it("waits for each processor callback and stops on the first error", async () => {
    const file = new File(["input\nfirst\nsecond\nthird\n"], "input.csv", {
      type: "text/csv",
    });
    const error = new Error("Could not process the second row");
    const completed: string[] = [];

    await expect(
      parseCsvClient(file, {
        processor: {
          onHeader: async () => {
            await Promise.resolve();
            completed.push("header");
          },
          onRow: async ([value]) => {
            expect(completed).toEqual(
              value === "first" ? ["header"] : ["header", "first"],
            );
            await Promise.resolve();
            if (value === "second") throw error;
            completed.push(value);
          },
        },
      }),
    ).rejects.toBe(error);

    expect(completed).toEqual(["header", "first"]);
  });

  it("explains the preview truncation when a >2MB file has a quoted cell cut at the preview boundary", async () => {
    const hugeCell = "A".repeat(3 * 1024 * 1024);
    const file = new File([`input\n"${hugeCell}"\n`], "large.csv", {
      type: "text/csv",
    });

    await expect(
      parseCsvClient(file, { isPreview: true, collectSamples: true }),
    ).rejects.toThrow(/single dataset items are too large/);
  });

  it("keeps the raw parser error for genuinely malformed small files", async () => {
    const file = new File(['input\n"unclosed\n'], "malformed.csv", {
      type: "text/csv",
    });

    await expect(
      parseCsvClient(file, { isPreview: true, collectSamples: true }),
    ).rejects.toThrow(/Quote Not Closed/);
  });
});
