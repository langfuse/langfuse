import { describe, expect, it } from "vitest";
import {
  executeObservationIoParserInstructions,
  validateObservationIoParserJsonPath,
} from "./jsonPath";

describe("validateObservationIoParserJsonPath", () => {
  it("rejects expressions that do not start at the root", () => {
    expect(validateObservationIoParserJsonPath("choices[0].text")).toEqual({
      success: false,
      error: "JSONPath expressions must start with $.",
    });
  });

  it("rejects unbalanced expressions", () => {
    expect(validateObservationIoParserJsonPath("$.choices[0")).toEqual({
      success: false,
      error:
        "JSONPath expressions must use balanced quotes, brackets, and parentheses.",
    });
  });
});

describe("executeObservationIoParserInstructions", () => {
  it("extracts fields from stringified input/output and metadata", () => {
    const result = executeObservationIoParserInstructions({
      instructions: {
        version: 1,
        fields: [
          {
            key: "question",
            label: "Question",
            source: "input",
            jsonPath: "$.messages[0].content",
            display: "auto",
          },
          {
            key: "answer",
            label: "Answer",
            source: "output",
            jsonPath: "$.choices[0].message.content",
            display: "markdown",
          },
          {
            key: "tenant",
            label: "Tenant",
            source: "metadata",
            jsonPath: "$.tenant",
            display: "auto",
          },
        ],
      },
      sourceData: {
        input: JSON.stringify({ messages: [{ content: "What is up?" }] }),
        output: JSON.stringify({
          choices: [{ message: { content: "Nothing much." } }],
        }),
        metadata: { tenant: "acme" },
      },
    });

    expect(result.fields).toMatchObject([
      { key: "question", value: "What is up?", status: "ok" },
      { key: "answer", value: "Nothing much.", status: "ok" },
      { key: "tenant", value: "acme", status: "ok" },
    ]);
    expect(result.serializedSize).toBeGreaterThan(0);
  });

  it("marks missing fields without throwing", () => {
    const result = executeObservationIoParserInstructions({
      instructions: {
        version: 1,
        fields: [
          {
            key: "missing",
            label: "Missing",
            source: "output",
            jsonPath: "$.doesNotExist",
            display: "auto",
          },
        ],
      },
      sourceData: {
        output: "{}",
      },
    });

    expect(result.fields).toEqual([
      {
        key: "missing",
        label: "Missing",
        source: "output",
        display: "auto",
        value: null,
        status: "miss",
      },
    ]);
  });
});
