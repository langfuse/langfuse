// @vitest-environment node

import {
  appendCategoryToExisting,
  getAddCategoryActionLabel,
  nextCategoryValue,
  resolveCategoricalNumericValue,
  validateNewCategoryLabel,
} from "@/src/features/scores/lib/annotationFormHelpers";

describe("nextCategoryValue", () => {
  it("starts at 0 when there are no categories", () => {
    expect(nextCategoryValue([])).toBe(0);
  });

  it("increments from the highest existing value", () => {
    expect(nextCategoryValue([{ value: 0 }, { value: 2 }, { value: 1 }])).toBe(
      3,
    );
  });
});

describe("validateNewCategoryLabel", () => {
  it("rejects a blank label", () => {
    expect(validateNewCategoryLabel("   ", [{ label: "internal_user" }])).toBe(
      "Category name is required",
    );
  });

  it("rejects a duplicate label", () => {
    expect(
      validateNewCategoryLabel("internal_user", [{ label: "internal_user" }]),
    ).toBe("A category with this name already exists");
  });

  it("accepts a unique trimmed label", () => {
    expect(
      validateNewCategoryLabel("  pen_testing  ", [{ label: "internal_user" }]),
    ).toBeNull();
  });
});

describe("getAddCategoryActionLabel", () => {
  it("uses the typed name when it is new", () => {
    expect(getAddCategoryActionLabel("pen_testing", ["internal_user"])).toBe(
      'Add "pen_testing"',
    );
  });

  it("falls back when the search is empty or already exists", () => {
    expect(getAddCategoryActionLabel("", ["internal_user"])).toBe(
      "Add new category",
    );
    expect(getAddCategoryActionLabel("internal_user", ["internal_user"])).toBe(
      "Add new category",
    );
  });
});

describe("resolveCategoricalNumericValue", () => {
  const staleCategories = [{ label: "internal_user", value: 0 }];

  it("cannot resolve a label that is missing from a stale category list", () => {
    expect(
      resolveCategoricalNumericValue({
        categories: staleCategories,
        stringValue: "pen_testing",
      }),
    ).toBeUndefined();
  });

  it("uses the server-returned value when the stale list does not include the new label", () => {
    expect(
      resolveCategoricalNumericValue({
        categories: staleCategories,
        stringValue: "pen_testing",
        numericValue: 1,
      }),
    ).toBe(1);
  });

  it("looks up an existing category when no numeric value is provided", () => {
    expect(
      resolveCategoricalNumericValue({
        categories: staleCategories,
        stringValue: "internal_user",
      }),
    ).toBe(0);
  });

  it("accepts a null category list when a numeric value is provided", () => {
    expect(
      resolveCategoricalNumericValue({
        categories: null,
        stringValue: "pen_testing",
        numericValue: 1,
      }),
    ).toBe(1);
  });
});

describe("appendCategoryToExisting", () => {
  const existing = [{ label: "internal_user", value: 0 }];

  it("appends onto the latest list so a later add does not drop an earlier one", () => {
    const first = appendCategoryToExisting(existing, "pen_testing");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = appendCategoryToExisting(first.categories, "just_testing");
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.categories.map((category) => category.label)).toEqual([
      "internal_user",
      "pen_testing",
      "just_testing",
    ]);
  });

  it("rejects a duplicate against the list being appended to", () => {
    const result = appendCategoryToExisting(existing, "internal_user");
    expect(result).toEqual({
      ok: false,
      error: "A category with this name already exists",
    });
  });
});
