import { describe, expect, it } from "vitest";

import { stringifyDatasetItemData } from "./datasetItemUtils";

describe("stringifyDatasetItemData", () => {
  it.each([
    [0, "0"],
    [false, "false"],
    ["", '""'],
  ])("preserves the JSON scalar %j", (value, expected) => {
    expect(stringifyDatasetItemData(value)).toBe(expected);
  });

  it.each([null, undefined])("renders %s as empty", (value) => {
    expect(stringifyDatasetItemData(value)).toBe("");
  });
});
