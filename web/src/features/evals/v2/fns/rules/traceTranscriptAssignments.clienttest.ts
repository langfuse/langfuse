import { describe, expect, it } from "vitest";
import {
  needsTraceMapping,
  rulesNeedingOverride,
  traceTranscriptAssignments,
  traceTranscriptMapping,
} from "./traceTranscriptAssignments";

describe("traceTranscriptAssignments", () => {
  it("stores an override only when the rule changes the mapping", () => {
    const threadsMapping = [
      {
        templateVariable: "conversation",
        selectedColumnId: "threads",
        jsonSelector: "$[1].messages",
      },
    ];
    const observationMapping = [
      { templateVariable: "input", selectedColumnId: "input" },
    ];
    const explicitMapping = [
      {
        templateVariable: "input",
        selectedColumnId: "threads",
        jsonSelector: "$[0].messages",
      },
    ];
    const editedMapping = [
      {
        templateVariable: "conversation",
        selectedColumnId: "threads",
        jsonSelector: "$[2].messages",
      },
    ];

    expect(
      traceTranscriptAssignments([
        {
          evaluatorId: "inherits",
          variableMapping: null,
          defaultVariableMapping: threadsMapping,
        },
        {
          evaluatorId: "unchanged",
          variableMapping: threadsMapping,
          defaultVariableMapping: threadsMapping,
        },
        {
          evaluatorId: "explicit",
          variableMapping: explicitMapping,
          defaultVariableMapping: observationMapping,
        },
        {
          evaluatorId: "edited",
          variableMapping: editedMapping,
          defaultVariableMapping: threadsMapping,
        },
      ]),
    ).toEqual([
      { evaluatorId: "inherits", variableMapping: null },
      { evaluatorId: "unchanged", variableMapping: null },
      { evaluatorId: "explicit", variableMapping: explicitMapping },
      { evaluatorId: "edited", variableMapping: editedMapping },
    ]);
  });

  it("asks for an explicit threads mapping when the evaluator's mapping reads other fields", () => {
    const observationMapping = [
      { templateVariable: "input", selectedColumnId: "input" },
    ];

    expect(traceTranscriptMapping(observationMapping)).toEqual([
      { templateVariable: "input", selectedColumnId: "", jsonSelector: null },
    ]);
    expect(
      needsTraceMapping({
        evaluatorType: "LLM_AS_JUDGE",
        variableMapping: null,
        defaultVariableMapping: observationMapping,
      }),
    ).toBe(true);
    expect(
      needsTraceMapping({
        evaluatorType: "LLM_AS_JUDGE",
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "threads",
            jsonSelector: "$[0].messages",
          },
        ],
        defaultVariableMapping: observationMapping,
      }),
    ).toBe(false);
  });

  it("flags inheriting rules whose target cannot read the evaluator mapping", () => {
    const threadsMapping = [
      {
        templateVariable: "input",
        selectedColumnId: "threads",
        jsonSelector: "$[0].messages",
      },
    ];
    const traceRule = {
      id: "trace-inherits",
      name: "Trace inherits",
      targetObject: "trace_transcript",
      enabled: true,
    };
    const observationRule = {
      id: "observations",
      name: "Observations",
      targetObject: "event",
      enabled: true,
    };
    const assignments = [
      { variableMapping: null, evaluationRule: traceRule },
      {
        variableMapping: threadsMapping,
        evaluationRule: { ...traceRule, id: "trace-override" },
      },
      { variableMapping: null, evaluationRule: observationRule },
    ];

    expect(
      rulesNeedingOverride(
        [{ templateVariable: "input", selectedColumnId: "input" }],
        assignments,
      ),
    ).toEqual([traceRule]);
    expect(rulesNeedingOverride(threadsMapping, assignments)).toEqual([
      observationRule,
    ]);
  });
});
