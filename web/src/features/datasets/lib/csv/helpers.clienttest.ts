import { describe, expect, it, vi } from "vitest";
import { parseColumns, parseCsvClient, parseValue } from "./helpers";

describe("CSV dataset parsing", () => {
  it.each([
    { headers: "input,input", isPreview: true },
    { headers: "input, input ", isPreview: true },
    { headers: "input,input", isPreview: false },
    { headers: "input, input ", isPreview: false },
  ])(
    "rejects duplicate headers '$headers' before processing (preview: $isPreview)",
    async ({ headers, isPreview }) => {
      const file = new File([`${headers}\nfirst,second\n`], "duplicate.csv", {
        type: "text/csv",
      });
      const onHeader = vi.fn();
      const onRow = vi.fn();

      await expect(
        parseCsvClient(file, {
          isPreview,
          collectSamples: true,
          processor: { onHeader, onRow },
        }),
      ).rejects.toThrow(/column names must be unique/i);
      expect(onHeader).not.toHaveBeenCalled();
      expect(onRow).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "keeps distinct case-sensitive columns separately mapped (preview: %s)",
    async (isPreview) => {
      const file = new File([" input ,Input\nfirst,second\n"], "unique.csv", {
        type: "text/csv",
      });
      let headerMap = new Map<string, number>();
      const importedValues: unknown[] = [];

      const preview = await parseCsvClient(file, {
        isPreview,
        collectSamples: true,
        processor: {
          onHeader: (headers) => {
            headerMap = new Map(
              headers.map((header, index) => [header, index]),
            );
          },
          onRow: (row) => {
            importedValues.push(
              parseColumns(["input", "Input"], row, headerMap),
            );
          },
        },
      });

      expect(preview.columns).toEqual([
        { name: "input", samples: ["first"], inferredType: "string" },
        { name: "Input", samples: ["second"], inferredType: "string" },
      ]);
      expect(importedValues).toEqual([{ input: "first", Input: "second" }]);
    },
  );

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
