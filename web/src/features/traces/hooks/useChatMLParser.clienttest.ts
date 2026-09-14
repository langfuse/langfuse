import { renderHook } from "@testing-library/react";
import { normalizeSpanIO } from "@langfuse/shared/src/utils/normalized-io";
import { toIOPreview } from "../parsers/toIOPreview";
import {
  parseChatML,
  type ChatMLParserResult,
  useChatMLParser,
} from "./useChatMLParser";

const parserImplementations = [
  {
    name: "legacy",
    parse: (input: unknown, output: unknown) =>
      parseChatML(input, output, undefined, undefined),
    // Legacy passes arguments through as the wire carried them.
    expectedArguments: (raw: string): unknown => raw,
  },
  {
    name: "normalized",
    parse: (input: unknown, output: unknown) =>
      toIOPreview(
        normalizeSpanIO({ input, output, metadata: undefined }),
        input,
      ),
    // The normalized parser canonicalizes: JSON-string arguments are decoded
    // once, so consumers always receive the parsed value.
    expectedArguments: (raw: string): unknown => JSON.parse(raw),
  },
] as const;

describe("useChatMLParser", () => {
  it.each(parserImplementations)(
    "$name parser groups output-side tool call arguments by tool name",
    ({ parse, expectedArguments }) => {
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

      const result = parse(input, output);

      expect(result.toolCallCounts.get("grep")).toBe(2);
      expect(result.toolCallCounts.get("write_file")).toBe(1);

      expect(result.toolCallsByName.get("grep")).toEqual([
        {
          id: "call-grep-1",
          name: "grep",
          arguments: expectedArguments('{"query":"first"}'),
          invocationNumber: 1,
        },
        {
          id: "call-grep-2",
          name: "grep",
          arguments: expectedArguments('{"query":"second"}'),
          invocationNumber: 3,
        },
      ]);
      expect(result.toolCallsByName.get("write_file")).toEqual([
        {
          id: "call-write-1",
          name: "write_file",
          arguments: expectedArguments('{"path":"todos.md"}'),
          invocationNumber: 2,
        },
      ]);
    },
  );

  it.each(parserImplementations)(
    "$name parser extracts args and input from raw passthrough tool calls",
    ({ parse }) => {
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

      const result = parse(input, output);

      expect(result.toolCallsByName.get("search")).toEqual([
        {
          id: "call-search",
          name: "search",
          arguments: { query: "docs" },
          invocationNumber: 1,
        },
      ]);
      expect(result.toolCallsByName.get("lookup")).toEqual([
        {
          id: "call-lookup",
          name: "lookup",
          arguments: { id: "trace-1" },
          invocationNumber: 2,
        },
      ]);
    },
  );

  it("reuses an already computed parser result", () => {
    const preparedResult: ChatMLParserResult = {
      canDisplayAsChat: true,
      allMessages: [],
      additionalInput: undefined,
      allTools: [],
      toolCallCounts: new Map(),
      toolCallsByName: new Map(),
      messageToToolCallNumbers: new Map(),
      toolNameToDefinitionNumber: new Map(),
      inputMessageCount: 0,
    };

    const { result } = renderHook(() =>
      useChatMLParser(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        preparedResult,
      ),
    );

    expect(result.current).toBe(preparedResult);
  });
});
