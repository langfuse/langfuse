import { describe, expect, it } from "vitest";
import {
  isPrettyLikeJsonView,
  toPrettyOrJsonView,
} from "@/src/components/ui/jsonViewPreference";

describe("toPrettyOrJsonView", () => {
  it("keeps raw JSON as the only json-rendering view", () => {
    expect(toPrettyOrJsonView("json")).toBe("json");
  });

  it("renders json-beta as Formatted", () => {
    expect(toPrettyOrJsonView("json-beta")).toBe("pretty");
  });

  it("renders pretty as Formatted", () => {
    expect(toPrettyOrJsonView("pretty")).toBe("pretty");
  });
});

describe("isPrettyLikeJsonView", () => {
  it("treats both JSON views as not pretty-like", () => {
    expect(isPrettyLikeJsonView("json")).toBe(false);
    expect(isPrettyLikeJsonView("json-beta")).toBe(false);
    expect(isPrettyLikeJsonView("pretty")).toBe(true);
  });
});
