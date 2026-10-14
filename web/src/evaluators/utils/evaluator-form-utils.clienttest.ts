import { describe, expect, it } from "vitest";
import {
  evalConfigFormSchema,
  getJsonPathCompatibilityWarning,
} from "./evaluator-form-utils";

describe("getJsonPathCompatibilityWarning", () => {
  it.each([
    {
      selector: "$.items[?(@.status === 'active')]",
      expected:
        "Filter expressions ([?...]) are not supported and will not be applied.",
    },
    {
      selector: "$.items[?@.status]",
      expected:
        "Filter expressions ([?...]) are not supported and will not be applied.",
    },
    {
      selector: "$.items[(@.length - 1)]",
      expected:
        "Script expressions ([(...)]) are not supported. The evaluator will use the unfiltered value instead.",
    },
    {
      selector: "$.items[-1]",
      expected:
        "Negative array indices (for example, [-1]) are not supported. Use a slice such as [-1:] instead.",
    },
    {
      selector: "$[‘items’][?@.a]",
      expected:
        "Filter expressions ([?...]) are not supported and will not be applied.",
    },
  ])("warns about unsupported selector $selector", ({ selector, expected }) => {
    expect(getJsonPathCompatibilityWarning(selector)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "$.items[0]",
    "$.items[-1:]",
    "$['property[-1]']",
    "$['property[?(@.active)]']",
    "$['property[(@.length - 1)]']",
    '$["Don’t"]',
    "$['it’s'].a",
    "$.Don’t",
    "$[‘items’]",
  ])("does not warn about supported selector %s", (selector) => {
    expect(getJsonPathCompatibilityWarning(selector)).toBeNull();
  });
});

describe("evalConfigFormSchema", () => {
  it("blocks configurations with unsupported JSONPath selectors", () => {
    const result = evalConfigFormSchema.safeParse({
      scoreName: "Correctness",
      target: "trace",
      filter: [],
      mapping: [
        {
          templateVariable: "input",
          langfuseObject: "trace",
          objectName: null,
          selectedColumnId: "input",
          jsonSelector: "$.items[?@.status]",
        },
      ],
      sampling: 1,
      delay: 0,
      timeScope: ["NEW"],
      runOnLive: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["mapping", 0, "jsonSelector"],
          message:
            "Filter expressions ([?...]) are not supported and will not be applied.",
        }),
      );
    }
  });

  // A target switch nulls selectedColumnId but keeps jsonSelector, hiding the
  // JsonPath input and the only place its warning could render.
  it("ignores unsupported selectors on columns that have no JsonPath input", () => {
    const result = evalConfigFormSchema.safeParse({
      scoreName: "Correctness",
      target: "event",
      filter: [],
      mapping: [
        {
          templateVariable: "input",
          langfuseObject: "event",
          objectName: null,
          selectedColumnId: null,
          jsonSelector: "$.items[?@.status]",
        },
      ],
      sampling: 1,
      delay: 0,
      timeScope: ["NEW"],
      runOnLive: true,
    });

    expect(result.success).toBe(true);
  });
});
