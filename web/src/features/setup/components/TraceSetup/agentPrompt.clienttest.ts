// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "./agentPrompt";

const baseUrl = "https://us.cloud.langfuse.com";
const langchain = {
  name: "LangChain & LangGraph",
  href: "https://langfuse.com/integrations/frameworks/langchain",
};

describe("buildAgentPrompt", () => {
  it("points the agent at the project's base URL without printing the keys", () => {
    const prompt = buildAgentPrompt({ baseUrl, integration: null });
    expect(prompt).toContain(`LANGFUSE_BASE_URL=${baseUrl}`);
    expect(prompt).not.toMatch(/(pk|sk)-lf-/);
  });

  it("names the picked integration and links its guide as markdown", () => {
    const prompt = buildAgentPrompt({ baseUrl, integration: langchain });
    expect(prompt).toContain("Use the LangChain & LangGraph integration");
    expect(prompt).toContain(
      "https://langfuse.com/integrations/frameworks/langchain.md",
    );
  });

  it("lets the agent pick the integration when none is picked", () => {
    const prompt = buildAgentPrompt({ baseUrl, integration: null });
    expect(prompt).toContain("Pick the integration that matches the stack");
    expect(prompt).toContain("https://langfuse.com/llms.txt");
    expect(prompt).not.toContain("Use the");
  });

  it("asks to run the app once and read its trace back", () => {
    const prompt = buildAgentPrompt({ baseUrl, integration: langchain });
    expect(prompt).toContain("Run the app once so a trace is sent");
  });
});
