import { extractLangfuseDocsSources } from "./extractLangfuseDocsSources";

describe("extractLangfuseDocsSources", () => {
  it("extracts and deduplicates document sources from docs tool results", () => {
    const result = JSON.stringify({
      _meta: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: [
                  { type: "text", text: "Search result" },
                  {
                    type: "document",
                    title: "Core Concepts",
                    url: "https://langfuse.com/docs/evaluation/core-concepts",
                  },
                  {
                    type: "document",
                    title: "Scores",
                    url: "https://langfuse.com/docs/evaluation/scores/overview",
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
                    title: "Datasets",
                    url: "https://langfuse.com/docs/datasets/overview",
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
                    title: "Scores duplicate",
                    url: "https://langfuse.com/docs/evaluation/scores/overview",
                  },
                ],
              }),
            },
          },
        ],
      },
    });

    expect(
      extractLangfuseDocsSources([
        {
          type: "tool",
          name: "langfuseDocs_search",
          args: "{}",
          status: "succeeded",
          result,
        },
        {
          type: "tool",
          name: "langfuse_queryMetrics",
          args: "{}",
          status: "succeeded",
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
      {
        title: "Datasets",
        url: "https://langfuse.com/docs/datasets/overview",
        faviconUrl: "https://langfuse.com/favicon.ico",
      },
    ]);
  });

  it("ignores malformed structured sources", () => {
    const result = JSON.stringify({
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

    expect(
      extractLangfuseDocsSources([
        {
          type: "tool",
          name: "langfuseDocs_search",
          args: "{}",
          status: "succeeded",
          result,
        },
      ]),
    ).toEqual([]);
  });
});
