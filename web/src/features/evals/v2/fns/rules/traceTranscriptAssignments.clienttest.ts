import { describe, expect, it } from "vitest";
import {
  traceRulesNeedingOverride,
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

  it("flags only inheriting trace rules once the evaluator mapping stops reading threads", () => {
    const assignments = [
      {
        variableMapping: null,
        evaluationRule: {
          id: "trace-inherits",
          name: "Trace inherits",
          targetObject: "trace_transcript",
        },
      },
      {
        variableMapping: [
          {
            templateVariable: "input",
            selectedColumnId: "threads",
            jsonSelector: "$[0].messages",
          },
        ],
        evaluationRule: {
          id: "trace-override",
          name: "Trace override",
          targetObject: "trace_transcript",
        },
      },
      {
        variableMapping: null,
        evaluationRule: {
          id: "observations",
          name: "Observations",
          targetObject: "event",
        },
      },
    ];

    expect(
      traceRulesNeedingOverride(
        [{ templateVariable: "input", selectedColumnId: "input" }],
        assignments,
      ),
    ).toEqual([{ id: "trace-inherits", name: "Trace inherits" }]);
    expect(
      traceRulesNeedingOverride(
        [
          {
            templateVariable: "input",
            selectedColumnId: "threads",
            jsonSelector: "$[0].messages",
          },
        ],
        assignments,
      ),
    ).toEqual([]);
  });
});
