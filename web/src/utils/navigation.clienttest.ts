// @vitest-environment node

import { describe, expect, it } from "vitest";
import { urlSearchParamsToQuery } from "@/src/utils/navigation";

describe("urlSearchParamsToQuery", () => {
  it("preserves single values and repeated query parameters", () => {
    const params = new URLSearchParams("page=2&filter=first&filter=second");

    expect(urlSearchParamsToQuery(params)).toEqual({
      page: "2",
      filter: ["first", "second"],
    });
  });

  it.each([
    { search: "__proto__=value", expected: "value" },
    {
      search: "__proto__=first&__proto__=second",
      expected: ["first", "second"],
    },
  ])("preserves reserved query keys for $search", ({ search, expected }) => {
    const result = urlSearchParamsToQuery(new URLSearchParams(search));

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result["__proto__"]).toEqual(expected);
  });
});
