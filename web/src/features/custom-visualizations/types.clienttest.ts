import { describe, expect, it } from "vitest";
import {
  TOOL_STARTER,
  TRACE_STARTER,
  VisualizationDefinitionGenerationSchema,
  VisualizationDefinitionSchema,
} from "./types";

describe("Custom UI definition contract", () => {
  it("accepts the declarative v2 starters", () => {
    expect(VisualizationDefinitionSchema.parse(TRACE_STARTER)).toEqual(
      TRACE_STARTER,
    );
    expect(VisualizationDefinitionSchema.parse(TOOL_STARTER)).toEqual(
      TOOL_STARTER,
    );
    expect(
      VisualizationDefinitionGenerationSchema.parse(TOOL_STARTER.spec),
    ).toEqual(TOOL_STARTER.spec);
    expect(
      VisualizationDefinitionGenerationSchema.safeParse(TOOL_STARTER).success,
    ).toBe(false);
  });

  it("rejects legacy renderer and transcript contracts", () => {
    expect(
      VisualizationDefinitionSchema.safeParse({
        ...TOOL_STARTER,
        binding: { source: "TRANSCRIPT" },
      }).success,
    ).toBe(false);
    expect(
      VisualizationDefinitionSchema.safeParse({
        ...TOOL_STARTER,
        renderer: { kind: "react", source: "return null" },
      }).success,
    ).toBe(false);
  });

  it("rejects executable or two-way catalog expressions", () => {
    expect(
      VisualizationDefinitionGenerationSchema.safeParse({
        root: "text",
        elements: {
          text: {
            type: "Text",
            props: {
              content: { $bindState: "/data/selectedValue" },
              variant: "body",
              maxLines: null,
            },
            children: [],
          },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps trace and session placement aligned with their match entity", () => {
    expect(
      VisualizationDefinitionSchema.safeParse({
        ...TRACE_STARTER,
        match: { ...TRACE_STARTER.match, entity: "OBSERVATION" },
      }).success,
    ).toBe(false);
    expect(
      VisualizationDefinitionSchema.safeParse({
        ...TOOL_STARTER,
        match: { ...TOOL_STARTER.match, entity: "TRACE" },
      }).success,
    ).toBe(false);
  });
});
