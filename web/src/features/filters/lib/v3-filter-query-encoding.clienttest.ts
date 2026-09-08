import { describe, expect, it } from "vitest";
import { getCommaArrayParam } from "./v3-filter-query-encoding";
import type { FilterState } from "@langfuse/shared";

describe("v3 table filter query encoding (getCommaArrayParam)", () => {
  const param = getCommaArrayParam("traces");

  it("round-trips a metadata filter whose key contains the field separator ';'", () => {
    const state: FilterState = [
      {
        column: "Metadata",
        type: "stringObject",
        key: "a;b",
        operator: "=",
        value: "x",
      },
    ];

    const decoded = param.decode(param.encode(state));

    // Before the fix the raw ";" split the encoded entry into 6 fields, the
    // entry failed validation, and the filter was silently dropped ([]).
    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]).toMatchObject({
      column: "Metadata",
      type: "stringObject",
      key: "a;b",
      operator: "=",
      value: "x",
    });
  });

  it("round-trips keys containing '%' and other reserved characters", () => {
    const state: FilterState = [
      {
        column: "Metadata",
        type: "stringObject",
        key: "cpu% & load;avg",
        operator: "contains",
        value: "x",
      },
    ];

    const decoded = param.decode(param.encode(state));

    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]?.key).toBe("cpu% & load;avg");
  });

  it("still round-trips plain keys", () => {
    const state: FilterState = [
      {
        column: "Metadata",
        type: "numberObject",
        key: "latency",
        operator: ">",
        value: 2,
      },
    ];

    const decoded = param.decode(param.encode(state));

    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]).toMatchObject({
      key: "latency",
      operator: ">",
      value: 2,
    });
  });

  it("tolerates legacy URLs whose keys were never percent-encoded", () => {
    // Written by the old encoder: raw '%' in the key would make a plain
    // decodeURIComponent throw and drop the whole filter param.
    const decoded = param.decode("metadata;stringObject;cpu%;=;x");

    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]?.key).toBe("cpu%");
  });
});
