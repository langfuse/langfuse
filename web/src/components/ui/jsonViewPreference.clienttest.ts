import { describe, expect, it } from "vitest";
import {
  isPrettyLikeJsonView,
  toPrettyOrJsonView,
} from "@/src/components/ui/jsonViewPreference";

describe("toPrettyOrJsonView", () => {
  it("keeps raw JSON as the only json-rendering view", () => {
    expect(toPrettyOrJsonView("json")).toBe("json");
  });

  // Regression: json-beta rows render inside an expandable table, so a
  // component that only knows pretty | json has to show the Formatted table.
  // Collapsing json-beta to "json" made expanded log rows render raw text.
  it("renders json-beta as Formatted", () => {
    expect(toPrettyOrJsonView("json-beta")).toBe("pretty");
  });

  it("renders pretty as Formatted", () => {
    expect(toPrettyOrJsonView("pretty")).toBe("pretty");
  });
});

describe("isPrettyLikeJsonView", () => {
  // Deliberately unlike toPrettyOrJsonView: this one gates pane layout, and
  // json-beta fills the pane with the advanced viewer.
  it("treats both JSON views as not pretty-like", () => {
    expect(isPrettyLikeJsonView("json")).toBe(false);
    expect(isPrettyLikeJsonView("json-beta")).toBe(false);
    expect(isPrettyLikeJsonView("pretty")).toBe(true);
  });
});
