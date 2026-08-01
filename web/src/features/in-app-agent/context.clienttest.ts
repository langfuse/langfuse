import { getInAppAgentScreenContextDescription } from "./context";

describe("getInAppAgentScreenContextDescription", () => {
  it.each([
    {
      name: "trace detail",
      url: "/project/project-1/traces/trace-1",
      expected: { type: "trace" },
    },
    {
      name: "selected observation in a trace",
      url: "/project/project-1/traces/trace-1?observation=observation-1",
      expected: { type: "observation" },
    },
    {
      name: "empty observation selection",
      url: "/project/project-1/traces/trace-1?observation=",
      expected: { type: "trace" },
    },
    {
      name: "observation peek",
      url: "/project/project-1/observations?peek=observation-1&traceId=trace-1",
      expected: { type: "observation" },
    },
    {
      name: "observation peek in V4 events table",
      url: "/project/project-1/traces?peek=trace-1&observation=observation-1",
      expected: { type: "observation" },
    },
    {
      name: "trace peek",
      url: "/project/project-1/traces?peek=trace-1",
      expected: { type: "trace" },
    },
    {
      name: "trace list without filters",
      url: "/project/project-1/traces",
      expected: { type: "trace-list", hasAppliedFilters: false },
    },
    {
      name: "trace list with structured filters",
      url: "/project/project-1/traces?filter=level%3BstringOptions%3B%3Bany+of%3BERROR",
      expected: { type: "trace-list", hasAppliedFilters: true },
    },
    {
      name: "observations list with full-text search",
      url: "/project/project-1/observations?search=checkout&searchType=id",
      expected: { type: "observations-list", hasAppliedFilters: true },
    },
    {
      name: "trace setup page",
      url: "/project/project-1/traces/setup",
      expected: { type: "page" },
    },
    {
      name: "prompt version",
      url: "/project/project-1/prompts/folder%2Fcheckout?version=12",
      expected: {
        type: "prompt",
        name: "folder/checkout",
        selector: { type: "version", value: "12" },
      },
    },
    {
      name: "prompt label",
      url: "/project/project-1/prompts/checkout?label=production",
      expected: {
        type: "prompt",
        name: "checkout",
        selector: { type: "label", value: "production" },
      },
    },
    {
      name: "prompt metrics",
      url: "/project/project-1/prompts/folder/checkout/metrics",
      expected: { type: "prompt", name: "folder/checkout" },
    },
    {
      name: "legacy prompt detail",
      url: "/project/project-1/prompts/prompt-detail?promptName=checkout",
      expected: { type: "prompt", name: "checkout" },
    },
    {
      name: "session detail",
      url: "/project/project-1/sessions/support%2F123",
      expected: { type: "session", id: "support/123" },
    },
    {
      name: "sessions list",
      url: "/project/project-1/sessions",
      expected: { type: "sessions-list", hasAppliedFilters: false },
    },
    {
      name: "prompts list",
      url: "/project/project-1/prompts?filter=type%3BstringOptions%3B%3D%3Bchat",
      expected: { type: "prompts-list", hasAppliedFilters: true },
    },
    {
      name: "dataset detail",
      url: "/project/project-1/datasets/dataset-1/items",
      expected: { type: "dataset" },
    },
    {
      name: "dataset item detail",
      url: "/project/project-1/datasets/dataset-1/items/item-1",
      expected: { type: "datasetItem" },
    },
    {
      name: "experiment run detail",
      url: "/project/project-1/datasets/dataset-1/runs/run-1",
      expected: { type: "experimentRun" },
    },
    {
      name: "datasets list",
      url: "/project/project-1/datasets",
      expected: { type: "datasets-list", hasAppliedFilters: false },
    },
    {
      name: "unknown project page",
      url: "/project/project-1/scores",
      expected: { type: "page" },
    },
    {
      name: "malformed encoded path",
      url: "/project/project-1/prompts/%E0%A4%A",
      expected: { type: "page" },
    },
  ])("describes $name", ({ url, expected }) => {
    expect(getInAppAgentScreenContextDescription(url)).toEqual(expected);
  });
});
