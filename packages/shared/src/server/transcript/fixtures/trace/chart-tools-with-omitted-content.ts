import type { TranscriptFixture } from "../fixture-types";

const traceId = "chart-tools-with-omitted-content";
const projectId = "transcript-fixture-project";
const request = "Generate a revenue chart and export its supporting files.";
const answer = "The revenue chart and its supporting files are ready.";
const calls = {
  role: "assistant",
  tool_calls: [
    {
      id: "call-chart",
      type: "function",
      function: { name: "generate_chart", arguments: "{}" },
    },
    {
      id: "call-image",
      type: "function",
      function: { name: "download_chart", arguments: "{}" },
    },
    {
      id: "call-annotations",
      type: "function",
      function: { name: "inspect_annotations", arguments: "{}" },
    },
    {
      id: "call-metadata",
      type: "function",
      function: { name: "get_chart_metadata", arguments: "{}" },
    },
    {
      id: "call-export",
      type: "function",
      function: { name: "export_chart", arguments: "{}" },
    },
  ],
};

export const chartToolsWithOmittedContentFixture = {
  name: "Chart tool outputs consume mixed/media content and survive generation replay",
  description:
    "Five tool executions return mixed text/JSON/media/custom content, media alone, custom content alone, a user-defined omittedContent key, and an explicit result with sibling media. Each becomes one tool result, preserving typed omission metadata when the next generation replays all results.",
  observations: [
    {
      project_id: projectId,
      trace_id: traceId,
      id: "chart-agent",
      parent_observation_id: null,
      type: "AGENT",
      name: "Chart assistant",
      start_time: "2026-01-01T12:00:00.000Z",
      end_time: "2026-01-01T12:00:10.000Z",
      input: request,
      output: answer,
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "chart-generation",
      parent_observation_id: "chart-agent",
      type: "GENERATION",
      name: "Plan chart tools",
      start_time: "2026-01-01T12:00:01.000Z",
      end_time: "2026-01-01T12:00:02.000Z",
      input: JSON.stringify([{ role: "user", content: request }]),
      output: JSON.stringify(calls),
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "chart-tool",
      parent_observation_id: "chart-generation",
      type: "TOOL",
      name: "generate_chart",
      start_time: "2026-01-01T12:00:02.000Z",
      end_time: "2026-01-01T12:00:03.000Z",
      input: "{}",
      output: JSON.stringify({
        role: "tool",
        content: [
          { type: "text", text: "Revenue chart generated." },
          { points: 12 },
          {
            type: "image_url",
            image_url: { url: "https://example.com/revenue.png" },
          },
          { type: "vendor-chart", value: { chartId: "revenue" } },
        ],
      }),
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "image-tool",
      parent_observation_id: "chart-generation",
      type: "TOOL",
      name: "download_chart",
      start_time: "2026-01-01T12:00:03.000Z",
      end_time: "2026-01-01T12:00:04.000Z",
      input: "{}",
      output: JSON.stringify({
        role: "tool",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/revenue.png" },
          },
        ],
      }),
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "annotations-tool",
      parent_observation_id: "chart-generation",
      type: "TOOL",
      name: "inspect_annotations",
      start_time: "2026-01-01T12:00:04.000Z",
      end_time: "2026-01-01T12:00:05.000Z",
      input: "{}",
      output: JSON.stringify({
        role: "tool",
        content: [
          { type: "vendor-annotations", value: { chartId: "revenue" } },
        ],
      }),
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "metadata-tool",
      parent_observation_id: "chart-generation",
      type: "TOOL",
      name: "get_chart_metadata",
      start_time: "2026-01-01T12:00:05.000Z",
      end_time: "2026-01-01T12:00:06.000Z",
      input: "{}",
      output: JSON.stringify({
        role: "tool",
        content: [
          { omittedContent: "User-provided value" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/revenue.png" },
          },
        ],
      }),
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "export-tool",
      parent_observation_id: "chart-generation",
      type: "TOOL",
      name: "export_chart",
      start_time: "2026-01-01T12:00:06.000Z",
      end_time: "2026-01-01T12:00:07.000Z",
      input: "{}",
      output: JSON.stringify({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-export",
            toolName: "export_chart",
            output: { exported: true },
          },
          {
            type: "image_url",
            image_url: { url: "https://example.com/export.png" },
          },
        ],
      }),
    },
    {
      project_id: projectId,
      trace_id: traceId,
      id: "summary-generation",
      parent_observation_id: "chart-agent",
      type: "GENERATION",
      name: "Summarize chart results",
      start_time: "2026-01-01T12:00:08.000Z",
      end_time: "2026-01-01T12:00:09.000Z",
      input: JSON.stringify([
        { role: "user", content: request },
        calls,
        {
          role: "tool",
          tool_call_id: "call-chart",
          content: "Revenue chart generated.",
        },
        {
          role: "tool",
          tool_call_id: "call-image",
          content: "Chart image downloaded.",
        },
        {
          role: "tool",
          tool_call_id: "call-annotations",
          content: "Chart annotations inspected.",
        },
        {
          role: "tool",
          tool_call_id: "call-metadata",
          content: "Chart metadata retrieved.",
        },
        {
          role: "tool",
          tool_call_id: "call-export",
          content: "Chart exported.",
        },
      ]),
      output: JSON.stringify({ role: "assistant", content: answer }),
    },
  ],
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 1,
          observations: [
            { id: "chart-generation", traceId },
            { id: "chart-tool", traceId },
            { id: "image-tool", traceId },
            { id: "annotations-tool", traceId },
            { id: "metadata-tool", traceId },
            { id: "export-tool", traceId },
            { id: "summary-generation", traceId },
          ],
          messages: [
            {
              role: "user",
              source: "input",
              observationId: "chart-generation",
              traceId,
              startTime: new Date("2026-01-01T12:00:01.000Z"),
              endTime: new Date("2026-01-01T12:00:02.000Z"),
              parts: [{ type: "text", text: request }],
            },
            {
              role: "assistant",
              source: "output",
              observationId: "chart-generation",
              traceId,
              startTime: new Date("2026-01-01T12:00:01.000Z"),
              endTime: new Date("2026-01-01T12:00:02.000Z"),
              parts: [
                {
                  type: "tool-call",
                  toolCallId: "call-chart",
                  toolName: "generate_chart",
                  input: {},
                  toolType: "function",
                },
                {
                  type: "tool-call",
                  toolCallId: "call-image",
                  toolName: "download_chart",
                  input: {},
                  toolType: "function",
                },
                {
                  type: "tool-call",
                  toolCallId: "call-annotations",
                  toolName: "inspect_annotations",
                  input: {},
                  toolType: "function",
                },
                {
                  type: "tool-call",
                  toolCallId: "call-metadata",
                  toolName: "get_chart_metadata",
                  input: {},
                  toolType: "function",
                },
                {
                  type: "tool-call",
                  toolCallId: "call-export",
                  toolName: "export_chart",
                  input: {},
                  toolType: "function",
                },
              ],
            },
            {
              role: "tool",
              source: "output",
              observationId: "chart-tool",
              traceId,
              startTime: new Date("2026-01-01T12:00:02.000Z"),
              endTime: new Date("2026-01-01T12:00:03.000Z"),
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call-chart",
                  toolName: "generate_chart",
                  output: ["Revenue chart generated.", { points: 12 }],
                  omittedContent: [
                    { kind: "media", count: 1 },
                    { kind: "unsupported", count: 1 },
                  ],
                },
              ],
            },
            {
              role: "tool",
              source: "output",
              observationId: "image-tool",
              traceId,
              startTime: new Date("2026-01-01T12:00:03.000Z"),
              endTime: new Date("2026-01-01T12:00:04.000Z"),
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call-image",
                  toolName: "download_chart",
                  output: null,
                  omittedContent: [{ kind: "media", count: 1 }],
                },
              ],
            },
            {
              role: "tool",
              source: "output",
              observationId: "annotations-tool",
              traceId,
              startTime: new Date("2026-01-01T12:00:04.000Z"),
              endTime: new Date("2026-01-01T12:00:05.000Z"),
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call-annotations",
                  toolName: "inspect_annotations",
                  output: null,
                  omittedContent: [{ kind: "unsupported", count: 1 }],
                },
              ],
            },
            {
              role: "tool",
              source: "output",
              observationId: "metadata-tool",
              traceId,
              startTime: new Date("2026-01-01T12:00:05.000Z"),
              endTime: new Date("2026-01-01T12:00:06.000Z"),
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call-metadata",
                  toolName: "get_chart_metadata",
                  output: { omittedContent: "User-provided value" },
                  omittedContent: [{ kind: "media", count: 1 }],
                },
              ],
            },
            {
              role: "tool",
              source: "output",
              observationId: "export-tool",
              traceId,
              startTime: new Date("2026-01-01T12:00:06.000Z"),
              endTime: new Date("2026-01-01T12:00:07.000Z"),
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call-export",
                  toolName: "export_chart",
                  output: { exported: true },
                  omittedContent: [{ kind: "media", count: 1 }],
                },
              ],
            },
            {
              role: "assistant",
              source: "output",
              observationId: "summary-generation",
              traceId,
              startTime: new Date("2026-01-01T12:00:08.000Z"),
              endTime: new Date("2026-01-01T12:00:09.000Z"),
              parts: [{ type: "text", text: answer }],
            },
          ],
        },
      },
    ],
  },
} satisfies TranscriptFixture;
