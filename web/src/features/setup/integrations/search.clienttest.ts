// @vitest-environment node

import { describe, expect, it } from "vitest";
import { nearMisses, searchIndexOf, searchIntegrations } from "./search";
import type { Integration } from "./types";

const integration = (
  slug: string,
  name: string,
  category: string,
  description = "",
): Integration => ({
  slug,
  name,
  category,
  description,
  href: `https://langfuse.com/integrations/${category}/${slug}`,
});

const catalog = [
  integration("langchain", "LangChain & LangGraph", "frameworks"),
  integration(
    "openai-py",
    "OpenAI (Python)",
    "model-providers",
    "Drop-in replacement of the OpenAI SDK for Langfuse tracing.",
  ),
  integration("claude-code", "Claude Code", "developer-tools"),
];
const titles = {
  frameworks: "Frameworks",
  "model-providers": "Model providers",
  "developer-tools": "Developer tools",
};
const index = searchIndexOf(catalog, titles);

describe("searchIntegrations", () => {
  it("matches the name, the category title and the description", () => {
    expect(searchIntegrations(index, "graph", null)).toEqual([catalog[0]]);
    expect(searchIntegrations(index, "developer", null)).toEqual([catalog[2]]);
    expect(searchIntegrations(index, "drop-in", null)).toEqual([catalog[1]]);
  });

  it("ignores Langfuse in descriptions and keeps to the category", () => {
    expect(searchIntegrations(index, "langfuse", null)).toEqual([]);
    expect(searchIntegrations(index, "", "developer-tools")).toEqual([
      catalog[2],
    ]);
  });
});

describe("nearMisses", () => {
  it("finds names a typo away and nothing below three letters", () => {
    expect(nearMisses(index, "langchian")).toEqual([catalog[0]]);
    expect(nearMisses(index, "cl")).toEqual([]);
  });

  it("allows one edit below five letters and two from five on", () => {
    expect(nearMisses(index, "lang")).toEqual([]);
    expect(nearMisses(index, "clade")).toEqual([catalog[2]]);
    expect(nearMisses(index, "oxenai")).toEqual([catalog[1]]);
    expect(nearMisses(index, "xyzzy")).toEqual([]);
  });
});
