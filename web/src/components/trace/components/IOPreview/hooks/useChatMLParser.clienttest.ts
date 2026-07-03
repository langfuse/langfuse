import { renderHook } from "@testing-library/react";
import { useChatMLParser } from "./useChatMLParser";

describe("useChatMLParser", () => {
  it("groups output-side tool call arguments by tool name", () => {
    const input = {
      messages: [
        {
          role: "system",
          content: "Use tools when needed.",
          tools: [
            {
              name: "grep",
              description: "Search files",
              parameters: { type: "object" },
            },
            {
              name: "write_file",
              description: "Write a file",
              parameters: { type: "object" },
            },
          ],
        },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "historical-call",
              name: "grep",
              arguments: '{"query":"old"}',
            },
          ],
        },
      ],
    };

    const output = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call-grep-1",
            name: "grep",
            arguments: '{"query":"first"}',
          },
          {
            id: "call-write-1",
            name: "write_file",
            arguments: '{"path":"todos.md"}',
          },
          {
            id: "call-grep-2",
            name: "grep",
            arguments: '{"query":"second"}',
          },
        ],
      },
    ];

    const { result } = renderHook(() =>
      useChatMLParser(
        undefined,
        undefined,
        undefined,
        undefined,
        input,
        output,
      ),
    );

    expect(result.current.toolCallCounts.get("grep")).toBe(2);
    expect(result.current.toolCallCounts.get("write_file")).toBe(1);

    expect(result.current.toolCallsByName.get("grep")).toEqual([
      {
        id: "call-grep-1",
        name: "grep",
        arguments: '{"query":"first"}',
        invocationNumber: 1,
      },
      {
        id: "call-grep-2",
        name: "grep",
        arguments: '{"query":"second"}',
        invocationNumber: 3,
      },
    ]);
    expect(result.current.toolCallsByName.get("write_file")).toEqual([
      {
        id: "call-write-1",
        name: "write_file",
        arguments: '{"path":"todos.md"}',
        invocationNumber: 2,
      },
    ]);
  });

  it("extracts args and input from raw passthrough tool calls", () => {
    const input = {
      messages: [
        {
          role: "system",
          content: "Use tools when needed.",
          tools: [
            {
              name: "search",
              parameters: { type: "object" },
            },
            {
              name: "lookup",
              parameters: { type: "object" },
            },
          ],
        },
      ],
    };

    const output = {
      tool_calls: [
        {
          id: "call-search",
          toolName: "search",
          input: { query: "docs" },
        },
        {
          id: "call-lookup",
          toolName: "lookup",
          args: { id: "trace-1" },
        },
      ],
    };

    const { result } = renderHook(() =>
      useChatMLParser(
        undefined,
        undefined,
        undefined,
        undefined,
        input,
        output,
      ),
    );

    expect(result.current.toolCallsByName.get("search")).toEqual([
      {
        id: "call-search",
        name: "search",
        arguments: { query: "docs" },
        invocationNumber: 1,
      },
    ]);
    expect(result.current.toolCallsByName.get("lookup")).toEqual([
      {
        id: "call-lookup",
        name: "lookup",
        arguments: { id: "trace-1" },
        invocationNumber: 2,
      },
    ]);
  });
});
