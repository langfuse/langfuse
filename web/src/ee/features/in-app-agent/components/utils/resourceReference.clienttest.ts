import { parseInAppAgentResourceHref } from "./resourceReference";

describe("parseInAppAgentResourceHref", () => {
  it("parses Langfuse product URLs", () => {
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/traces/trace-1",
      ),
    ).toEqual({ type: "trace", id: "trace-1" });
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/traces/trace-1?observation=obs-1",
      ),
    ).toEqual({ type: "observation", id: "obs-1", traceId: "trace-1" });
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/scores?scoreId=score-1",
      ),
    ).toEqual({ type: "score", id: "score-1" });
  });

  it("rejects malformed or unrelated values", () => {
    expect(parseInAppAgentResourceHref("trace trace-1")).toBeNull();
    expect(
      parseInAppAgentResourceHref("https://example.com/trace/trace-1"),
    ).toBeNull();
    expect(
      parseInAppAgentResourceHref(
        "https://example.com/project/project-1/traces/trace-1",
      ),
    ).toBeNull();
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/traces/%E0%A4%A",
      ),
    ).toBeNull();
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/scores/analytics",
      ),
    ).toBeNull();
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/datasets/dataset-1",
      ),
    ).toBeNull();
    expect(
      parseInAppAgentResourceHref(
        "https://cloud.langfuse.com/project/project-1/scores",
      ),
    ).toBeNull();
  });
});
