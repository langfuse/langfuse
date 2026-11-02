import { renderHook } from "@testing-library/react";
import { normalizeSpanIO } from "@langfuse/shared/src/utils/normalized-io";
import { toIOPreview } from "../parsers/toIOPreview";
import { hasThinkingContent } from "../fns/chatMessageUtils";
import { getSkillLoadRequests } from "../fns/getSkillLoadRequests";
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
      toIOPreview(normalizeSpanIO({ input, output, metadata: undefined })),
    // The normalized parser canonicalizes: JSON-string arguments are decoded
    // once, so consumers always receive the parsed value.
    expectedArguments: (raw: string): unknown => JSON.parse(raw),
  },
] as const;

describe("useChatMLParser", () => {
  it.each(parserImplementations)(
    "$name parser highlights only skills requested by the current generation",
    ({ parse }) => {
      const available = [
        { skillName: "refund-policy", skillVersion: 3 },
        { skillName: "shipping-policy", skillVersion: 1 },
        { skillName: "account-security" },
      ];
      const result = parse(
        [
          {
            role: "assistant",
            tool_calls: [
              {
                id: "historical",
                name: "loadSkill",
                arguments: { name: "shipping-policy" },
              },
            ],
          },
        ],
        [
          {
            role: "assistant",
            tool_calls: [
              {
                id: "load-refund",
                name: "loadSkill",
                arguments: '{"name":"refund-policy","version":"3"}',
              },
              {
                id: "read-security",
                name: "Read",
                arguments: { file_path: "/skills/account-security/SKILL.md" },
              },
              {
                id: "read-refund-resource",
                name: "loadSkillResource",
                arguments: {
                  name: "refund-policy",
                  version: "3",
                  path: "references/refunds.md",
                },
              },
            ],
          },
        ],
      );

      const requests = getSkillLoadRequests(available, result.toolCallsByName);
      expect(requests.has(available[1])).toBe(false);
      expect(requests.get(available[0])).toEqual(
        new Set(["SKILL.md", "references/refunds.md"]),
      );
      expect(requests.get(available[2])).toEqual(
        new Set(["/skills/account-security/SKILL.md"]),
      );
    },
  );

  it("does not infer a skill load from malformed, unrelated, or ambiguous calls", () => {
    const available = [
      { skillName: "refund-policy", skillVersion: 2 },
      { skillName: "refund-policy", skillVersion: 3 },
      { skillName: "shipping-policy" },
    ];
    const calls = [
      { name: "loadSkill", arguments: { name: "refund-policy" } },
      { name: "loadSkill", arguments: { name: "refund-policy", version: 4 } },
      { name: "loadSkill", arguments: '{"name":' },
      { name: "loadSkill", arguments: ["shipping-policy"] },
      { name: "loadSkill", arguments: { name: "unknown-skill" } },
      { name: "loadSkillResource", arguments: { name: "shipping-policy" } },
      { name: "search", arguments: { name: "shipping-policy" } },
      {
        name: "Read",
        arguments: { path: "/skills/shipping-policy-backup/SKILL.md" },
      },
      {
        name: "Read",
        arguments: { path: "/skills/shipping-policy/../other/SKILL.md" },
      },
      { name: "Read", arguments: { path: "/skills/shipping-policy/" } },
      {
        name: "Read",
        arguments: { path: "/repo/shipping-policy/notes.txt" },
      },
      {
        name: "readFile",
        arguments: { path: "/repo/shipping-policy/notes.txt" },
      },
      {
        name: "Read",
        arguments: { path: "/skills/shipping-policy/refund-policy/SKILL.md" },
      },
    ].map((call, index) => ({ ...call, invocationNumber: index + 1 }));
    const byName = new Map<string, typeof calls>();
    for (const call of calls)
      byName.set(call.name, [...(byName.get(call.name) ?? []), call]);

    expect(getSkillLoadRequests(available, byName).size).toBe(0);
    const explicitVersion = {
      name: "loadSkill",
      arguments: { name: "refund-policy", version: 3 },
      invocationNumber: 12,
    };
    byName.set("loadSkill", [explicitVersion]);
    expect(getSkillLoadRequests(available, byName).get(available[1])).toEqual(
      new Set(["SKILL.md"]),
    );
  });

  it.each(["invalid", "0", "-1", "3.5", null, {}])(
    "ignores an invalid requested skill version: %j",
    (version) => {
      const available = [{ skillName: "refund-policy", skillVersion: 3 }];
      const call = {
        name: "loadSkill",
        arguments: { name: "refund-policy", version },
        invocationNumber: 1,
      };
      expect(
        getSkillLoadRequests(available, new Map([[call.name, [call]]])).size,
      ).toBe(0);
    },
  );

  it.each([
    ["Skill", { skill: "refund-policy" }, "SKILL.md"],
    ["skill", { name: "refund-policy" }, "SKILL.md"],
    [
      "skill_read",
      { skillName: "refund-policy", path: "references/refunds.md" },
      "references/refunds.md",
    ],
    [
      "readFile",
      { path: "/skills/refund-policy/SKILL.md" },
      "/skills/refund-policy/SKILL.md",
    ],
    ["langfuse_loadSkill", { name: "refund-policy" }, "SKILL.md"],
    [
      "langfuse_loadSkillResource",
      { name: "refund-policy", path: "SKILL.md" },
      "SKILL.md",
    ],
  ])("recognizes the %s skill-loading adapter", (name, args, filePath) => {
    const available = [{ skillName: "refund-policy" }];
    const call = { name, arguments: args, invocationNumber: 1 };
    expect(
      getSkillLoadRequests(available, new Map([[name, [call]]])).get(
        available[0],
      ),
    ).toEqual(new Set([filePath]));
  });

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

  it.each(parserImplementations)(
    "$name parser renders a Thinking block for a plugin `thinking` sibling array",
    ({ parse }) => {
      const reasoning = "The user wants the repo described in one line.";

      const result = parse([{ role: "user", content: "What is this repo?" }], {
        role: "assistant",
        content: "A scratch repository.",
        thinking: [
          { type: "thinking", content: reasoning, signature: "sig_sibling" },
        ],
      });

      const assistant = result.allMessages.find(
        (message) => message.role === "assistant",
      );

      expect(assistant && hasThinkingContent(assistant)).toBe(true);
      expect(assistant?.thinking).toEqual([
        { type: "thinking", content: reasoning, signature: "sig_sibling" },
      ]);
    },
  );

  it("normalized parser renders a Thinking block for a plugin thinking part in `content`", () => {
    const reasoning = "The user wants the repo described in one line.";

    const result = toIOPreview(
      normalizeSpanIO({
        input: [{ role: "user", content: "What is this repo?" }],
        output: {
          role: "assistant",
          content: [
            { type: "thinking", content: reasoning, signature: "sig_inline" },
            { type: "text", text: "A scratch repository." },
          ],
        },
        metadata: undefined,
      }),
    );

    const assistant = result.allMessages.find(
      (message) => message.role === "assistant",
    );

    expect(assistant && hasThinkingContent(assistant)).toBe(true);
    expect(assistant?.thinking).toEqual([
      { type: "thinking", content: reasoning, signature: "sig_inline" },
    ]);
  });

  it("reuses an already computed parser result", () => {
    const preparedResult: ChatMLParserResult = {
      canDisplayAsChat: true,
      allMessages: [],
      additionalInput: undefined,
      allTools: [],
      toolCallCounts: new Map(),
      toolCallsByName: new Map(),
      messageToToolCallNumbers: new Map(),
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
