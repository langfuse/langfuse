import { convertRecordValuesToString } from "../utils";
import { expect, describe, it } from "vitest";

describe("convertRecordValuesToString", () => {
  it("stringifies non-string values and passes strings through", () => {
    expect(
      convertRecordValuesToString({ a: "x", b: 2, c: { d: true } }),
    ).toEqual({
      a: "x",
      b: "2",
      c: '{"d":true}',
    });
  });

  it("keeps a __proto__ key as an own property instead of dropping it", () => {
    // JSON.parse (how ingested metadata actually arrives) creates __proto__
    // as an own property; an object literal with a `__proto__:` key would
    // instead set the prototype, which is a different, unrelated behavior.
    const input = JSON.parse('{"__proto__": "hello", "env": "prod"}');
    const result = convertRecordValuesToString(input);

    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(
      true,
    );
    expect(result.__proto__).toBe("hello");
    expect(result.env).toBe("prod");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
