import type { AgUiMessage } from "@/src/ee/features/in-app-agent/schema";
import { extractLangfuseDocsSources, getDrawerMessages } from "./utils";

describe("extractLangfuseDocsSources", () => {
  it("extracts and deduplicates structured sources from docs tool results", () => {
    const result = JSON.stringify({
      content: [{ type: "document", title: "Core Concepts" }],
      sources: [
        {
          url: "https://langfuse.com/docs/evaluation/core-concepts",
          title: "Core Concepts",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
        {
          url: "https://langfuse.com/docs/evaluation/scores/overview",
          title: "Scores",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
        {
          url: "https://langfuse.com/docs/evaluation/scores/overview",
          title: "Scores duplicate",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
      ],
    });

    expect(
      extractLangfuseDocsSources([
        {
          type: "tool",
          name: "langfuseDocs_search",
          args: "{}",
          result,
        },
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: "{}",
          result,
        },
      ]),
    ).toEqual([
      {
        title: "Core Concepts",
        url: "https://langfuse.com/docs/evaluation/core-concepts",
        faviconUrl: "https://langfuse.com/favicon.ico",
      },
      {
        title: "Scores",
        url: "https://langfuse.com/docs/evaluation/scores/overview",
        faviconUrl: "https://langfuse.com/favicon.ico",
      },
    ]);
  });

  it("ignores malformed structured sources", () => {
    const result = JSON.stringify({
      sources: [
        {
          url: "https://langfuse.com/docs/evaluation/core-concepts",
        },
        {
          url: 1,
          title: "Invalid URL",
        },
      ],
    });

    expect(
      extractLangfuseDocsSources([
        {
          type: "tool",
          name: "langfuseDocs_search",
          args: "{}",
          result,
        },
      ]),
    ).toEqual([]);
  });
});

describe("getDrawerMessages", () => {
  it("attaches docs sources to the answer after a search preamble", () => {
    const docsResult = JSON.stringify({
      sources: [
        {
          url: "https://langfuse.com/docs/audit-logs",
          title: "Audit Logs",
          faviconUrl: "https://langfuse.com/favicon.ico",
        },
      ],
    });

    const mappedMessages = getDrawerMessages({
      error: null,
      isRunning: false,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Does Langfuse have access logging?",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content:
            "I'll search the Langfuse documentation for information about access logging.",
          toolCalls: [
            {
              id: "tool-call-1",
              type: "function",
              function: {
                name: "langfuseDocs_search",
                arguments: "{}",
              },
            },
          ],
        },
        {
          id: "tool-result-1",
          role: "tool",
          toolCallId: "tool-call-1",
          content: docsResult,
        },
        {
          id: "assistant-2",
          role: "assistant",
          content: "Yes, Langfuse has audit logging available.",
        },
      ] satisfies AgUiMessage[],
    });

    expect(mappedMessages).toMatchObject([
      {
        id: "user-1",
        content: { type: "text" },
      },
      {
        id: "assistant-1",
        content: {
          type: "text",
          text: "I'll search the Langfuse documentation for information about access logging.",
        },
      },
      {
        id: "assistant-1-tools",
        content: { type: "toolGroup" },
      },
      {
        id: "assistant-2",
        content: {
          type: "text",
          text: "Yes, Langfuse has audit logging available.",
          sources: [
            {
              title: "Audit Logs",
              url: "https://langfuse.com/docs/audit-logs",
              faviconUrl: "https://langfuse.com/favicon.ico",
            },
          ],
        },
      },
    ]);

    expect(mappedMessages[1]?.content).not.toHaveProperty("sources");
  });
});
