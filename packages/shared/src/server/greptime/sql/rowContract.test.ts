import { describe, expect, it } from "vitest";

import {
  greptimeBool,
  greptimeDate,
  greptimeDecimal,
  greptimeJson,
  selectJsonColumn,
} from "./rowContract";

describe("selectJsonColumn", () => {
  it("wraps a JSON column in json_to_string (bare reads return jsonb binary)", () => {
    expect(selectJsonColumn("metadata")).toBe(
      "json_to_string(`metadata`) AS `metadata`",
    );
    expect(selectJsonColumn("tags", { alias: "trace_tags" })).toBe(
      "json_to_string(`tags`) AS `trace_tags`",
    );
  });

  it("quotes only the column under a table alias (not `t.metadata` as one ident)", () => {
    expect(selectJsonColumn("metadata", { tablePrefix: "t" })).toBe(
      "json_to_string(t.`metadata`) AS `metadata`",
    );
  });
});

describe("greptimeBool", () => {
  it("coerces GreptimeDB's 0/1 number representation", () => {
    expect(greptimeBool(1)).toBe(true);
    expect(greptimeBool(0)).toBe(false);
    expect(greptimeBool(true)).toBe(true);
    expect(greptimeBool("1")).toBe(true);
    expect(greptimeBool("true")).toBe(true);
    expect(greptimeBool(null)).toBe(false);
  });
});

describe("greptimeJson", () => {
  it("parses json_to_string text", () => {
    expect(greptimeJson('{"a":1}', {})).toEqual({ a: 1 });
    expect(greptimeJson('["x","y"]', [])).toEqual(["x", "y"]);
  });
  it("falls back on null/empty/garbage", () => {
    expect(greptimeJson(null, { d: 1 })).toEqual({ d: 1 });
    expect(greptimeJson("", [])).toEqual([]);
    expect(greptimeJson("not json", { d: 1 })).toEqual({ d: 1 });
  });
  it("passes through already-parsed objects", () => {
    const o = { a: 1 };
    expect(greptimeJson(o, {})).toBe(o);
  });

  it("falls back on raw jsonb bytes (contract violated: bare JSON select)", () => {
    expect(greptimeJson(Buffer.from([0x40, 0x00, 0x01]), { d: 1 })).toEqual({
      d: 1,
    });
    expect(greptimeJson(new Uint8Array([1, 2, 3]), [])).toEqual([]);
  });
});

describe("greptimeDate / greptimeDecimal", () => {
  it("keeps Date and tolerates ms/string", () => {
    const d = new Date("2026-06-03T14:00:00.123Z");
    expect(greptimeDate(d)).toBe(d);
    expect(greptimeDate(d.getTime())?.toISOString()).toBe(
      "2026-06-03T14:00:00.123Z",
    );
    expect(greptimeDate(null)).toBeNull();
  });
  it("keeps decimal precision as string", () => {
    expect(greptimeDecimal("1.234500000000")).toBe("1.234500000000");
    expect(greptimeDecimal(null)).toBeNull();
  });
});
