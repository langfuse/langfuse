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
            source: "input",
            jsonPath: "$.messages[0].content",
            display: "auto",
          },
          {
            source: "output",
            jsonPath: "$.choices[0].message.content",
            display: "markdown",
          },
          {
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
      { key: "content", label: "Content", value: "What is up?", status: "ok" },
      {
        key: "content_2",
        label: "Content 2",
        value: "Nothing much.",
        status: "ok",
      },
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
        key: "does_not_exist",
        label: "Does Not Exist",
        source: "output",
        display: "auto",
        value: null,
        status: "miss",
      },
    ]);
  });

  it("infers field identity from source and JSONPath", () => {
    const result = executeObservationIoParserInstructions({
      instructions: {
        version: 1,
        fields: [
          {
            source: "output",
            jsonPath: "$.quality",
            display: "auto",
          },
          {
            source: "metadata",
            jsonPath: "$",
            display: "json",
          },
        ],
      },
      sourceData: {
        output: { quality: "good" },
        metadata: { environment: "development" },
      },
    });

    expect(result.fields).toMatchObject([
      {
        key: "quality",
        label: "Quality",
        value: "good",
        status: "ok",
      },
      {
        key: "metadata",
        label: "Metadata",
        value: { environment: "development" },
        status: "ok",
      },
    ]);
  });
});
