import { describe, expect, it } from "vitest";
import { isNullOrUndefined } from "./isNullOrUndefined";

describe("isNullOrUndefined", () => {
  it.each([null, undefined])("matches %s", (value) => {
    expect(isNullOrUndefined(value)).toBe(true);
  });

  it.each([0, false, "", NaN, [], {}])(
    "preserves non-nullish values: %s",
    (value) => {
      expect(isNullOrUndefined(value)).toBe(false);
    },
  );
});
