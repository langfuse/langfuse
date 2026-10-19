import { describe, expect, it } from "vitest";

import {
  LAST,
  WILDCARD,
  jsonPathToSegments,
  segmentsToJsonPath,
} from "@/src/features/evals/v2/fns/variableMapping/segmentsToJsonPath";
import { extractValueFromObject } from "@langfuse/shared";

describe("JSONPath segments", () => {
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

  it("round-trips every supported segment type", () => {
    const segments = [
      "messages",
      WILDCARD,
      0,
      "non-identifier key",
      'quoted"key',
    ] as const;

    const path = segmentsToJsonPath([...segments]);

    expect(path).toBe('$.messages[*][0]["non-identifier key"]["quoted\\"key"]');
    expect(jsonPathToSegments(path!)).toEqual(segments);
  });

  it.each(["messages", "$.", "$[-1]", "$[1:]", "$[?(@.active)]"])(
    "rejects unsupported path %s",
    (path) => {
      expect(jsonPathToSegments(path)).toBeNull();
    },
  );
});
