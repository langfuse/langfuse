import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import {
  anthropicEventToOpenAi,
  createAnthropicSseTransform,
  openAiToAnthropic,
} from "../src/translate.js";

test("translates text and base64 image messages to Anthropic", () => {
  const result = openAiToAnthropic({
    model: "benchmark-model",
    max_tokens: 42,
    stream: true,
    messages: [
      { role: "system", content: "Be concise" },
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,aGVsbG8=" },
          },
        ],
      },
    ],
  });

  assert.deepEqual(result, {
    model: "benchmark-model",
    max_tokens: 42,
    stream: true,
    system: [{ type: "text", text: "Be concise" }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "aGVsbG8=",
            },
          },
        ],
      },
    ],
  });
});

test("translates coding-agent messages, tools, and generation controls", () => {
  const result = openAiToAnthropic({
    model: "benchmark-model",
    max_tokens: 4096,
    stream: true,
    temperature: 0.2,
    top_p: 0.95,
    stop: ["<benchmark-stop>", "<tool-stop>"],
    tool_choice: {
      type: "function",
      function: { name: "read_repository_file" },
    },
    tools: [
      {
        type: "function",
        function: {
          name: "read_repository_file",
          description: "Read a repository file",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      },
    ],
    messages: [
      { role: "system", content: "System instructions" },
      { role: "developer", content: "Repository instructions" },
      { role: "user", content: "Inspect the implementation" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "read_repository_file",
              arguments: '{"path":"src/index.ts"}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: "export const value = 1;",
      },
      { role: "assistant", content: "The implementation exports value." },
    ],
  });

  assert.deepEqual(result, {
    model: "benchmark-model",
    max_tokens: 4096,
    stream: true,
    temperature: 0.2,
    top_p: 0.95,
    stop_sequences: ["<benchmark-stop>", "<tool-stop>"],
    tool_choice: { type: "tool", name: "read_repository_file" },
    tools: [
      {
        name: "read_repository_file",
        description: "Read a repository file",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
    system: [
      { type: "text", text: "System instructions" },
      { type: "text", text: "Repository instructions" },
    ],
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Inspect the implementation" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "read_repository_file",
            input: { path: "src/index.ts" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_1",
            content: "export const value = 1;",
          },
        ],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "The implementation exports value." }],
      },
    ],
  });
});

test("maps OpenAI string tool choices to Anthropic", () => {
  for (const [source, expected] of [
    ["auto", { type: "auto" }],
    ["required", { type: "any" }],
    ["none", { type: "none" }],
  ]) {
    const result = openAiToAnthropic({
      model: "benchmark-model",
      messages: [{ role: "user", content: "hello" }],
      tool_choice: source,
    });
    assert.deepEqual(result.tool_choice, expected);
  }
});

test("incrementally translates Anthropic SSE to OpenAI SSE", async () => {
  const transform = createAnthropicSseTransform("fallback-model");
  const output = [];
  transform.on("data", (chunk) => output.push(chunk));

  const input = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"claude-test","usage":{"input_tokens":3}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join("");

  for (let index = 0; index < input.length; index += 7) {
    transform.write(Buffer.from(input.slice(index, index + 7)));
  }
  transform.end();
  await once(transform, "end");

  const text = Buffer.concat(output).toString("utf8");
  assert.match(text, /"id":"msg_1"/);
  assert.match(text, /"content":"hello"/);
  assert.match(text, /"finish_reason":"stop"/);
  assert.match(text, /"choices":\[\],"usage":/);
  assert.match(text, /"total_tokens":5/);
  assert.match(text, /data: \[DONE\]/);
});

test("translates text and tool-use SSE without leaking thinking", async () => {
  const transform = createAnthropicSseTransform("fallback-model");
  const output = [];
  transform.on("data", (chunk) => output.push(chunk));

  const input = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_tools","model":"claude-test","usage":{"input_tokens":7}}}\n\n',
    'event: ping\ndata: {"type":"ping"}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"private reasoning"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"signed"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Applying patch"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"apply_repository_patch","input":{}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\\"patch\\":\\""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"change\\"}"}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":2}\n\n',
    'event: future_event\ndata: {"type":"future_event","value":true}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":11}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join("");

  for (let index = 0; index < input.length; index += 11) {
    transform.write(Buffer.from(input.slice(index, index + 11)));
  }
  transform.end();
  await once(transform, "end");

  const frames = Buffer.concat(output)
    .toString("utf8")
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => frame.slice("data: ".length))
    .map((data) => (data === "[DONE]" ? data : JSON.parse(data)));

  assert.equal(JSON.stringify(frames).includes("private reasoning"), false);
  assert.ok(
    frames.some(
      (frame) => frame?.choices?.[0]?.delta?.content === "Applying patch",
    ),
  );
  assert.deepEqual(frames[2].choices[0].delta, {
    tool_calls: [
      {
        index: 0,
        id: "toolu_1",
        type: "function",
        function: { name: "apply_repository_patch", arguments: "" },
      },
    ],
  });
  assert.equal(
    frames[3].choices[0].delta.tool_calls[0].function.arguments,
    '{"patch":"',
  );
  assert.equal(
    frames[4].choices[0].delta.tool_calls[0].function.arguments,
    'change"}',
  );
  assert.equal(frames[5].choices[0].finish_reason, "tool_calls");
  assert.deepEqual(frames[6].choices, []);
  assert.deepEqual(frames[6].usage, {
    prompt_tokens: 7,
    completion_tokens: 11,
    total_tokens: 18,
  });
  assert.equal(frames[7], "[DONE]");
});

test("surfaces Anthropic in-band stream errors", () => {
  assert.throws(
    () =>
      anthropicEventToOpenAi(
        {
          event: "error",
          data: {
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
          },
        },
        {},
      ),
    /Overloaded/,
  );
});
