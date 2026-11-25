import { describe, expect, it } from "vitest";
import {
  rulesNeedingOverride,
  traceTranscriptAssignments,
} from "./traceTranscriptAssignments";

describe("traceTranscriptAssignments", () => {
  it("stores an override only when the rule edits the mapping or the evaluator's mapping needs converting", () => {
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
          evaluatorId: "converted",
          variableMapping: null,
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
      {
        evaluatorId: "converted",
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "threads",
            jsonSelector: "$[0].messages",
          },
        ],
      },
      { evaluatorId: "edited", variableMapping: editedMapping },
    ]);
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
