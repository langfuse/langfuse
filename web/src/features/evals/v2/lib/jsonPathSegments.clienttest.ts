import { describe, expect, it } from "vitest";

import {
  LAST,
  jsonPathToSegments,
  segmentsToJsonPath,
} from "@/src/features/evals/v2/lib/jsonPathSegments";
import { extractValueFromObject } from "@langfuse/shared";

describe("array last-entry mappings", () => {
  it("stores and restores a dynamic last-entry JSONPath", () => {
    const path = segmentsToJsonPath(["messages", LAST, "content"]);

    expect(path).toBe("$.messages[-1:].content");
    expect(jsonPathToSegments(path!)).toEqual(["messages", LAST, "content"]);

    expect(
      extractValueFromObject(
        { input: { messages: [{ content: "first" }, { content: "last" }] } },
        "input",
        path!,
      ),
    ).toEqual({ value: "last", error: null });
  });
});
