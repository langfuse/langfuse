import {
  getAddCategoryActionLabel,
  nextCategoryValue,
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
