import {
  arrayFitsInSingleRowPreview,
  getSmartExpansionState,
  objectFitsInSingleRowPreview,
  SMALL_ARRAY_THRESHOLD,
  SMALL_OBJECT_THRESHOLD,
  transformJsonToTableData,
} from "@/src/components/table/utils/jsonExpansionUtils";

const DEFAULT_MAX_ROWS = 20;

/** Same lazy top-level shape PrettyJsonView uses for smart expansion. */
const tableRows = (json: unknown) =>
  transformJsonToTableData(json, "", 0, "", true);

describe("arrayFitsInSingleRowPreview", () => {
  it("is true for a short list of primitives", () => {
    expect(arrayFitsInSingleRowPreview(["email", "paid_social"])).toBe(true);
    expect(arrayFitsInSingleRowPreview([1, 2, 3])).toBe(true);
    expect(arrayFitsInSingleRowPreview([true, null])).toBe(true);
  });

  it("is true at the preview size limit", () => {
    expect(
      arrayFitsInSingleRowPreview(
        Array.from({ length: SMALL_ARRAY_THRESHOLD }, (_, i) => `item-${i}`),
      ),
    ).toBe(true);
  });

  it("is false when the preview would truncate", () => {
    expect(
      arrayFitsInSingleRowPreview(
        Array.from(
          { length: SMALL_ARRAY_THRESHOLD + 1 },
          (_, i) => `item-${i}`,
        ),
      ),
    ).toBe(false);
  });

  it("is false for lists of objects or nested arrays", () => {
    expect(arrayFitsInSingleRowPreview([{ name: "Ada" }])).toBe(false);
    expect(arrayFitsInSingleRowPreview([[1, 2]])).toBe(false);
  });

  it("is false for empty arrays and non-arrays", () => {
    expect(arrayFitsInSingleRowPreview([])).toBe(false);
    expect(arrayFitsInSingleRowPreview({ a: 1 })).toBe(false);
    expect(arrayFitsInSingleRowPreview("email")).toBe(false);
  });
});

describe("objectFitsInSingleRowPreview", () => {
  it("is true for a short object of primitives", () => {
    expect(objectFitsInSingleRowPreview({ name: "Ada" })).toBe(true);
    expect(objectFitsInSingleRowPreview({ ok: true, n: 1 })).toBe(true);
  });

  it("is true at the preview size limit", () => {
    const value = Object.fromEntries(
      Array.from({ length: SMALL_OBJECT_THRESHOLD }, (_, i) => [`k${i}`, i]),
    );
    expect(objectFitsInSingleRowPreview(value)).toBe(true);
  });

  it("is false when the preview would omit fields or nest further", () => {
    expect(objectFitsInSingleRowPreview({ a: 1, b: 2, c: 3 })).toBe(false);
    expect(objectFitsInSingleRowPreview({ name: { first: "Ada" } })).toBe(
      false,
    );
  });

  it("is false for empty objects, arrays, and primitives", () => {
    expect(objectFitsInSingleRowPreview({})).toBe(false);
    expect(objectFitsInSingleRowPreview(["Ada"])).toBe(false);
    expect(objectFitsInSingleRowPreview("Ada")).toBe(false);
  });
});

describe("getSmartExpansionState", () => {
  it("does not expand a short primitive list whose preview already shows every item", () => {
    const rows = tableRows({
      brand: "Acme",
      channels: ["email", "paid_social"],
    });

    expect(getSmartExpansionState(rows, DEFAULT_MAX_ROWS)).toEqual({});
  });

  it("does not expand a short object whose preview already shows every field", () => {
    const rows = tableRows({
      user: { name: "Ada" },
    });

    expect(getSmartExpansionState(rows, DEFAULT_MAX_ROWS)).toEqual({});
  });

  it("still expands a list of objects whose preview is incomplete", () => {
    const rows = tableRows({
      users: [{ name: "Ada" }, { name: "Bob" }],
    });

    expect(getSmartExpansionState(rows, DEFAULT_MAX_ROWS)).toEqual({
      users: true,
    });
  });

  it("still expands a primitive list that does not fit in the single-row preview", () => {
    const rows = tableRows({
      tags: ["a", "b", "c", "d", "e", "f"],
    });

    expect(getSmartExpansionState(rows, DEFAULT_MAX_ROWS)).toEqual({
      tags: true,
    });
  });

  it("expands a nested object but leaves its short primitive list collapsed", () => {
    const rows = tableRows({
      config: {
        theme: "dark",
        channels: ["email", "paid_social"],
      },
    });

    expect(getSmartExpansionState(rows, DEFAULT_MAX_ROWS)).toEqual({
      config: true,
    });
  });
});
