import { afterEach, describe, expect, it } from "vitest";

import {
  clearAgentEvaluatorDraft,
  forgetPendingAgentEvaluatorDraft,
  readAgentEvaluatorDraft,
  writeAgentEvaluatorDraft,
} from "./evaluatorDraftStorage";

describe("evaluatorDraftStorage", () => {
  afterEach(() => {
    clearAgentEvaluatorDraft("project-1");
    clearAgentEvaluatorDraft("project-2");
    window.sessionStorage.clear();
  });

  it("round-trips a draft for the same project", () => {
    writeAgentEvaluatorDraft("project-1", {
      name: "Helpfulness",
      description: null,
      definition: {
        type: "LLM_AS_JUDGE",
        prompt: "Score {{output}}",
        provider: null,
        model: null,
        modelParams: null,
        vars: ["output"],
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
          },
        ],
        outputDefinition: {
          version: 2,
          dataType: "NUMERIC",
          reasoning: { description: "Explain the score." },
          score: {
            description: "Quality of the response.",
            minValue: 0,
            maxValue: 1,
          },
        },
      },
    });

    expect(readAgentEvaluatorDraft("project-1")?.name).toBe("Helpfulness");
    expect(readAgentEvaluatorDraft("project-2")).toBeNull();
  });

  it("reads a previously written draft from session storage after memory is cleared", () => {
    writeAgentEvaluatorDraft("project-1", {
      name: "Helpfulness",
      description: null,
      definition: {
        type: "LLM_AS_JUDGE",
        prompt: "Score {{output}}",
        provider: null,
        model: null,
        modelParams: null,
        vars: ["output"],
        variableMapping: [
          {
            templateVariable: "output",
            selectedColumnId: "output",
          },
        ],
        outputDefinition: {
          version: 2,
          dataType: "NUMERIC",
          reasoning: { description: "Explain the score." },
          score: {
            description: "Quality of the response.",
            minValue: 0,
            maxValue: 1,
          },
        },
      },
    });

    forgetPendingAgentEvaluatorDraft("project-1");

    expect(readAgentEvaluatorDraft("project-1")?.name).toBe("Helpfulness");
  });
});
