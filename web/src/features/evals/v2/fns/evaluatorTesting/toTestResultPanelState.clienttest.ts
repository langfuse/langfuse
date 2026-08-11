import { describe, expect, it } from "vitest";
import { toTestResultPanelState } from "./toTestResultPanelState";

describe("toTestResultPanelState", () => {
  it("maps LLM and code responses into the provided result panel", () => {
    expect(
      toTestResultPanelState({
        type: "LLM_AS_JUDGE",
        isPending: false,
        result: {
          success: true,
          result: { score: 0.8, reasoning: "Mostly grounded" },
        },
      }),
    ).toEqual({
      status: "llm-success",
      score: "0.8",
      reasoning: "Mostly grounded",
    });

    expect(
      toTestResultPanelState({
        type: "CODE",
        isPending: false,
        result: {
          success: true,
          scores: [{ name: "Exact match", value: true, comment: null }],
        },
      }),
    ).toEqual({
      status: "code-success",
      scores: [{ name: "Exact match", value: "true", comment: null }],
    });
  });

  it("keeps pending and failed runs distinct", () => {
    expect(
      toTestResultPanelState({
        type: "CODE",
        isPending: true,
        result: null,
      }),
    ).toEqual({ status: "running" });
    expect(
      toTestResultPanelState({
        type: "CODE",
        isPending: false,
        result: { success: false, error: { message: "Syntax error" } },
      }),
    ).toEqual({ status: "run-error", message: "Syntax error" });
    expect(
      toTestResultPanelState({
        type: "CODE",
        isPending: false,
        result: { requestError: "Not authorized" },
      }),
    ).toEqual({ status: "request-error", message: "Not authorized" });
  });
});
