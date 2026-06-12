import type { Tool } from "@mastra/core/tools";

import { prefixLangfuseDocsTools } from "@/src/ee/features/in-app-agent/server/tools";

type UnknownTool = Tool<unknown, unknown, unknown, unknown>;

async function executeWrappedDocsTool(result: unknown) {
  const tools = prefixLangfuseDocsTools({
    search: {
      execute: vi.fn(async () => result),
    } as unknown as UnknownTool,
  });
  const tool = tools.langfuseDocs_search;

  if (typeof tool?.execute !== "function") {
    throw new Error("Expected wrapped tool to expose execute");
  }

  return (
    tool.execute as (input: unknown, context: unknown) => Promise<unknown>
  )({}, {});
}

describe("prefixLangfuseDocsTools", () => {
  it("extracts the first top-level Inkeep document source from each choice", async () => {
    const result = await executeWrappedDocsTool({
      _meta: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: [
                  { type: "text", text: "Search result" },
                  {
                    type: "document",
                    title: " Audit Logs ",
                    url: " https://langfuse.com/docs/audit-logs ",
                  },
                  {
                    type: "document",
                    title: "Ignored second document",
                    url: "https://langfuse.com/docs/second",
                  },
                ],
              }),
            },
          },
          {
            message: {
              content: JSON.stringify({
                content: [
                  {
                    type: "document",
                    url: "https://langfuse.com/docs/scores",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      sources: [
        {
          title: "Audit Logs",
          url: "https://langfuse.com/docs/audit-logs",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
        {
          title: "https://langfuse.com/docs/scores",
          url: "https://langfuse.com/docs/scores",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
      ],
    });
  });

  it("ignores malformed Inkeep choice content and invalid document URLs", async () => {
    const result = await executeWrappedDocsTool({
      _meta: {
        choices: [
          { message: { content: "not json" } },
          { message: { content: JSON.stringify({ content: "not array" }) } },
          {
            message: {
              content: JSON.stringify({
                content: [
                  { type: "document", title: "Missing URL" },
                  { type: "document", title: "Blank URL", url: "   " },
                  {
                    type: "document",
                    title: "Unsafe protocol",
                    url: "javascript:alert(1)",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({ sources: [] });
  });
});
