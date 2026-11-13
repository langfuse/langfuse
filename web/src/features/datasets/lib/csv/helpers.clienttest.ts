import { describe, expect, it } from "vitest";
import { parseColumns, parseCsvClient, parseValue } from "./helpers";

describe("CSV dataset parsing", () => {
  it("preserves quoted text whitespace in previews and imported values", async () => {
    const input = "  keep me  ";
    const expectedOutput = "\n  expected output  \n";
    const file = new File(
      [
        '"  input  "," expected_output ",unquoted,empty,blank,number,json,boolean,null\n' +
          `"${input}","${expectedOutput}",  trimmed  ,,"  "," 42 "," {""answer"":42} "," FALSE "," NULL "\n`,
      ],
      "whitespace.csv",
      { type: "text/csv" },
    );
    const importedRows: unknown[] = [];

    const preview = await parseCsvClient(file, {
      collectSamples: true,
      processor: {
        onRow: (row, headers) => {
          const headerMap = new Map(
            headers.map((header, index) => [header, index]),
          );
          importedRows.push(parseColumns(headers, row, headerMap));
        },
      },
    });

    expect(preview.previewRows[0].slice(0, 2)).toEqual([input, expectedOutput]);
    expect(preview.columns.slice(0, 2)).toEqual([
      { name: "input", samples: [input], inferredType: "string" },
      {
        name: "expected_output",
        samples: [expectedOutput],
        inferredType: "string",
      },
    ]);
    expect(
      preview.columns.slice(2).map((column) => column.inferredType),
    ).toEqual(["string", "null", "null", "number", "json", "boolean", "null"]);
    expect(importedRows).toEqual([
      {
        input,
        expected_output: expectedOutput,
        unquoted: "trimmed",
        empty: null,
        blank: null,
        number: 42,
        json: { answer: 42 },
        boolean: false,
        null: null,
      },
    ]);
  });

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
