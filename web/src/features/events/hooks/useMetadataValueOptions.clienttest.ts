import { describe, expect, it } from "vitest";
import { type FilterState } from "@langfuse/shared";

import { __test } from "./useMetadataValueOptions";

const { zipMetadataValueOptions, metadataKeysInUse } = __test;

describe("zipMetadataValueOptions", () => {
  it("maps every in-use key to its own value options, not just the last", () => {
    const map = zipMetadataValueOptions(
      ["region", "tier"],
      [
        { data: [{ value: "us" }, { value: "eu" }] },
        { data: [{ value: "gold" }] },
      ],
    );
    expect(Object.keys(map)).toEqual(["region", "tier"]);
    expect(map.region?.map((o) => o.value)).toEqual(["us", "eu"]);
    expect(map.tier?.map((o) => o.value)).toEqual(["gold"]);
  });

  it("skips keys whose query has not resolved", () => {
    const map = zipMetadataValueOptions(
      ["region", "tier"],
      [{ data: undefined }, { data: [{ value: "gold" }] }],
    );
    expect(map).not.toHaveProperty("region");
    expect(map.tier?.map((o) => o.value)).toEqual(["gold"]);
  });
});

describe("metadataKeysInUse", () => {
  it("unions committed stringObject keys with keys edited this session, deduped", () => {
    const filterState = [
      {
        type: "stringObject",
        column: "metadata",
        operator: "=",
        key: "region",
        value: "us",
      },
      { type: "string", column: "name", operator: "=", value: "x" },
    ] as unknown as FilterState;
    expect(metadataKeysInUse(filterState, ["tier", "region"]).sort()).toEqual([
      "region",
      "tier",
    ]);
  });

  it("includes an edited key that is not yet a committed filter row", () => {
    expect(metadataKeysInUse([] as FilterState, ["region"])).toEqual([
      "region",
    ]);
  });
});
