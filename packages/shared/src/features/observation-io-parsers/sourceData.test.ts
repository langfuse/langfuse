import { describe, expect, it } from "vitest";
import { ObservationIoParserInstructionsSchema } from "../../domain/observation-io-parser-configs";
import { executeObservationIoParserInstructions } from "./jsonPath";
import { buildObservationIoParserSourceData } from "./sourceData";

describe("ObservationIoParserInstructionsSchema", () => {
  it("requires an explicit source representation", () => {
    const result = ObservationIoParserInstructionsSchema.safeParse({
      version: 1,
      fields: [{ source: "output", jsonPath: "$.quality" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects conversation fields for raw JSON parser sources", () => {
    const result = ObservationIoParserInstructionsSchema.safeParse({
      version: 1,
      sourceRepresentation: "raw_json",
      fields: [{ source: "conversation", jsonPath: "$.lastText" }],
    });

    expect(result.success).toBe(false);
  });
});

describe("buildObservationIoParserSourceData", () => {
  it("parses raw JSON sources without adding normalized conversation data", () => {
    const sourceData = buildObservationIoParserSourceData({
      instructions: {
        version: 1,
        sourceRepresentation: "raw_json",
        fields: [{ source: "output", jsonPath: "$.quality", display: "auto" }],
      },
      sourceData: {
        input: JSON.stringify({ prompt: "rate this" }),
        output: JSON.stringify({ quality: "good" }),
        metadata: JSON.stringify({ environment: "development" }),
      },
    });

    expect(sourceData).toEqual({
      input: { prompt: "rate this" },
      output: { quality: "good" },
      metadata: { environment: "development" },
    });
  });

  it("builds normalized input, output, and conversation sections", () => {
    const sourceData = buildObservationIoParserSourceData({
      instructions: {
        version: 1,
        sourceRepresentation: "normalized_chat",
        fields: [
          { source: "conversation", jsonPath: "$.lastText", display: "auto" },
        ],
      },
      sourceData: {
        input: JSON.stringify({
          messages: [{ role: "user", content: "hello" }],
        }),
        output: JSON.stringify({
          role: "assistant",
          content: [{ type: "text", text: "world" }],
        }),
        metadata: JSON.stringify({ environment: "development" }),
      },
    });

    expect(sourceData.metadata).toEqual({ environment: "development" });
    expect(sourceData.input).toMatchObject({
      lastText: "hello",
    });
    expect(sourceData.output).toMatchObject({
      lastText: "world",
    });
    expect(sourceData.conversation).toMatchObject({
      lastText: "world",
    });
  });

  it("supports output-only normalized text", () => {
    const sourceData = buildObservationIoParserSourceData({
      instructions: {
        version: 1,
        sourceRepresentation: "normalized_chat",
        fields: [{ source: "output", jsonPath: "$.lastText", display: "auto" }],
      },
      sourceData: {
        output: "plain answer",
      },
    });

    expect(sourceData.output).toMatchObject({
      lastText: "plain answer",
    });
    expect(sourceData.conversation).toMatchObject({
      lastText: "plain answer",
    });
  });

  it("feeds normalized source data into JSONPath extraction", () => {
    const instructions = {
      version: 1 as const,
      sourceRepresentation: "normalized_chat" as const,
      fields: [
        {
          source: "conversation" as const,
          jsonPath: "$.lastText",
          display: "auto" as const,
        },
      ],
    };
    const sourceData = buildObservationIoParserSourceData({
      instructions,
      sourceData: {
        input: { messages: [{ role: "user", content: "hello" }] },
        output: { role: "assistant", content: "final answer" },
      },
    });

    const parsed = executeObservationIoParserInstructions({
      instructions,
      sourceData,
    });

    expect(parsed.fields).toMatchObject([
      {
        key: "lastText",
        source: "conversation",
        value: "final answer",
        status: "ok",
      },
    ]);
  });
});
