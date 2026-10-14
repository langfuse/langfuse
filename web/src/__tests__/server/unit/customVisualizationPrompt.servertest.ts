import { describe, expect, it } from "vitest";
import { CUSTOM_UI_GENERATION_SYSTEM_PROMPT } from "@/src/features/custom-visualizations/server/visualizationGenerationPrompt";

describe("Custom UI generation prompt", () => {
  it("uses the catalog vocabulary without asking for embedded state or patches", () => {
    expect(CUSTOM_UI_GENERATION_SYSTEM_PROMPT).toContain(
      "AVAILABLE COMPONENTS",
    );
    expect(CUSTOM_UI_GENERATION_SYSTEM_PROMPT).toContain("ToolCallSummary");
    expect(CUSTOM_UI_GENERATION_SYSTEM_PROMPT).toContain("/data/selectedValue");
    expect(CUSTOM_UI_GENERATION_SYSTEM_PROMPT).not.toContain(
      "Output JSONL (one JSON object per line)",
    );
    expect(CUSTOM_UI_GENERATION_SYSTEM_PROMPT).not.toContain(
      "Specs include a /state field",
    );
  });
});
