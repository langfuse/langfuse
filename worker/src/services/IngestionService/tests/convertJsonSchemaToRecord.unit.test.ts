import { convertJsonSchemaToRecord } from "../utils";
import { expect, describe, it } from "vitest";

// Spec (LFE-14344): bare-scalar root metadata must be wrapped under the
// "metadata" key, mirroring convertPostgresJsonToMetadataRecord. Booleans
// are the fix target; string/number/array/object pin existing behavior.
describe("convertJsonSchemaToRecord", () => {
  // Load-bearing: the acceptance criterion itself — bare `true` must not be
  // raw-cast to Record<string, string>.
  it("wraps a bare boolean true as { metadata: 'true' }", () => {
    expect(convertJsonSchemaToRecord(true)).toEqual({ metadata: "true" });
  });

  // Function-level contract only: callers currently short-circuit falsy
  // metadata (false/0/"") via truthy guards, so false does not reach this
  // branch end-to-end.
  it("wraps a bare boolean false as { metadata: 'false' }", () => {
    expect(convertJsonSchemaToRecord(false)).toEqual({ metadata: "false" });
  });

  // Regressions: existing scalar/array/object wrapping must stay unchanged.
  it("wraps a bare string under the metadata key", () => {
    expect(convertJsonSchemaToRecord("hello")).toEqual({ metadata: "hello" });
  });

  it("wraps a bare number under the metadata key as a string", () => {
    expect(convertJsonSchemaToRecord(42)).toEqual({ metadata: "42" });
  });

  it("wraps an array under the metadata key as JSON", () => {
    expect(convertJsonSchemaToRecord([1, "a", true])).toEqual({
      metadata: '[1,"a",true]',
    });
  });

  // Pins CURRENT behavior per acceptance criteria ("object inputs
  // unchanged"): objects pass through as-is. Note this deliberately does NOT
  // mirror convertPostgresJsonToMetadataRecord, which stringifies non-string
  // values.
  it("passes object inputs through unchanged", () => {
    expect(convertJsonSchemaToRecord({ a: "x", b: 2, c: { d: true } })).toEqual(
      {
        a: "x",
        b: 2,
        c: { d: true },
      },
    );
  });
});
