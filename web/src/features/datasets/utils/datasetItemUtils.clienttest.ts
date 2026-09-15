// @vitest-environment node

import { stringifyDatasetItemData } from "./datasetItemUtils";

describe("stringifyDatasetItemData", () => {
  it("preserves valid JSON scalar values", () => {
    expect(stringifyDatasetItemData(0)).toBe("0");
    expect(stringifyDatasetItemData(false)).toBe("false");
  });

  it("renders nullish values as empty strings", () => {
    expect(stringifyDatasetItemData(null)).toBe("");
    expect(stringifyDatasetItemData(undefined)).toBe("");
  });
});
