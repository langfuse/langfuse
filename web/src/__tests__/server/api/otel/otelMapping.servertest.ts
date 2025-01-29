import { convertOtelSpanToIngestionEvent } from "@/src/features/otel/server";
import { ingestionEvent } from "@langfuse/shared/src/server";

describe("OTel Resource Span Mapping", () => {
  it("should convert an OpenLit OTel Span to Langfuse Events", () => {
    // Setup
    const resourceSpan = {
      resource: {
        attributes: [
          {
            key: "telemetry.sdk.language",
            value: { stringValue: "python" },
          },
          { key: "telemetry.sdk.name", value: { stringValue: "openlit" } },
          {
            key: "telemetry.sdk.version",
            value: { stringValue: "1.27.0" },
          },
          { key: "service.name", value: { stringValue: "default" } },
          {
            key: "deployment.environment",
            value: { stringValue: "default" },
          },
        ],
      },
      scopeSpans: [
        {
          scope: { name: "openlit.otel.tracing" },
          spans: [
            {
              traceId: {
                type: "Buffer",
                data: [
                  234, 103, 55, 8, 68, 28, 41, 132, 165, 74, 62, 57, 98, 211,
                  89, 95,
                ],
              },
              spanId: {
                type: "Buffer",
                data: [185, 4, 191, 251, 32, 190, 109, 126],
              },
              name: "openai.chat.completions",
              kind: 3,
              startTimeUnixNano: {
                low: 153687506,
                high: 404677085,
                unsigned: true,
              },
              endTimeUnixNano: {
                low: 1327836088,
                high: 404677085,
                unsigned: true,
              },
              attributes: [
                {
                  key: "telemetry.sdk.name",
                  value: { stringValue: "openlit" },
                },
                { key: "gen_ai.system", value: { stringValue: "openai" } },
                {
                  key: "gen_ai.operation.name",
                  value: { stringValue: "chat" },
                },
                {
                  key: "gen_ai.endpoint",
                  value: { stringValue: "openai.chat.completions" },
                },
                {
                  key: "gen_ai.response.id",
                  value: {
                    stringValue: "chatcmpl-AugxBIoQzz2zFMWFoiyS3Vmm1OuQI",
                  },
                },
                {
                  key: "gen_ai.environment",
                  value: { stringValue: "default" },
                },
                {
                  key: "gen_ai.application_name",
                  value: { stringValue: "default" },
                },
                {
                  key: "gen_ai.request.model",
                  value: { stringValue: "gpt-3.5-turbo" },
                },
                {
                  key: "gen_ai.request.top_p",
                  value: { doubleValue: 1 },
                },
                {
                  key: "gen_ai.request.max_tokens",
                  value: { intValue: { low: -1, high: -1, unsigned: false } },
                },
                {
                  key: "gen_ai.request.user",
                  value: { stringValue: "" },
                },
                {
                  key: "gen_ai.request.temperature",
                  value: { doubleValue: 1 },
                },
                {
                  key: "gen_ai.request.presence_penalty",
                  value: { doubleValue: 0 },
                },
                {
                  key: "gen_ai.request.frequency_penalty",
                  value: { doubleValue: 0 },
                },
                { key: "gen_ai.request.seed", value: { stringValue: "" } },
                {
                  key: "gen_ai.request.is_stream",
                  value: { boolValue: false },
                },
                {
                  key: "gen_ai.usage.input_tokens",
                  value: { intValue: { low: 14, high: 0, unsigned: false } },
                },
                {
                  key: "gen_ai.usage.output_tokens",
                  value: { intValue: { low: 96, high: 0, unsigned: false } },
                },
                {
                  key: "gen_ai.usage.total_tokens",
                  value: { intValue: { low: 110, high: 0, unsigned: false } },
                },
                {
                  key: "gen_ai.response.finish_reasons",
                  value: {
                    arrayValue: { values: [{ stringValue: "stop" }] },
                  },
                },
                {
                  key: "gen_ai.usage.cost",
                  value: { doubleValue: 0.000151 },
                },
              ],
              events: [
                {
                  timeUnixNano: {
                    low: 1327691067,
                    high: 404677085,
                    unsigned: true,
                  },
                  name: "gen_ai.content.prompt",
                  attributes: [
                    {
                      key: "gen_ai.prompt",
                      value: {
                        stringValue: "user: What is LLM Observability?",
                      },
                    },
                  ],
                },
                {
                  timeUnixNano: {
                    low: 1327737136,
                    high: 404677085,
                    unsigned: true,
                  },
                  name: "gen_ai.content.completion",
                  attributes: [
                    {
                      key: "gen_ai.completion",
                      value: {
                        stringValue:
                          "LLM Observability stands for logs, metrics, and traces observability. It refers to the practice of monitoring and analyzing logs, metrics, and traces from a software application to gain insight into its performance, behavior, and issues. By collecting and analyzing these data points, developers and operators can better understand how the application is functioning and troubleshoot any problems that may arise. This approach is increasingly important in modern software development, where applications are often complex and distributed across multiple environments.",
                      },
                    },
                  ],
                },
              ],
              status: { code: 1 },
            },
          ],
        },
      ],
    };

    // When
    const langfuseEvents = convertOtelSpanToIngestionEvent(resourceSpan);

    // Then
    // Will throw an error if the parsing fails
    const parsedEvents = langfuseEvents.map((event) =>
      ingestionEvent.parse(event),
    );
    expect(parsedEvents).toHaveLength(2);
  });

  it("should convert a TraceLoop OTel Span to Langfuse Events", () => {
    // Setup
    const resourceSpan = {
      resource: {
        attributes: [
          {
            key: "service.name",
            value: {
              stringValue:
                "/usr/local/lib/python3.11/dist-packages/colab_kernel_launcher.py",
            },
          },
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: "opentelemetry.instrumentation.openai.v1",
            version: "0.33.9",
          },
          spans: [
            {
              traceId: {
                type: "Buffer",
                data: [
                  228, 239, 69, 2, 92, 155, 64, 146, 75, 255, 23, 94, 43, 18,
                  91, 91,
                ],
              },
              spanId: {
                type: "Buffer",
                data: [170, 191, 22, 228, 22, 174, 73, 82],
              },
              name: "openai.chat",
              kind: 3,
              startTimeUnixNano: {
                low: 865964564,
                high: 404693214,
                unsigned: true,
              },
              endTimeUnixNano: {
                low: -1984808674,
                high: 404693214,
                unsigned: true,
              },
              attributes: [
                { key: "llm.request.type", value: { stringValue: "chat" } },
                { key: "gen_ai.system", value: { stringValue: "OpenAI" } },
                {
                  key: "gen_ai.request.model",
                  value: { stringValue: "gpt-3.5-turbo" },
                },
                { key: "llm.headers", value: { stringValue: "None" } },
                { key: "llm.is_streaming", value: { boolValue: false } },
                {
                  key: "gen_ai.openai.api_base",
                  value: { stringValue: "https://api.openai.com/v1/" },
                },
                { key: "gen_ai.prompt.0.role", value: { stringValue: "user" } },
                {
                  key: "gen_ai.prompt.0.content",
                  value: { stringValue: "What is LLM Observability?" },
                },
                {
                  key: "gen_ai.response.model",
                  value: { stringValue: "gpt-3.5-turbo-0125" },
                },
                {
                  key: "llm.usage.total_tokens",
                  value: { intValue: { low: 187, high: 0, unsigned: false } },
                },
                {
                  key: "gen_ai.usage.completion_tokens",
                  value: { intValue: { low: 173, high: 0, unsigned: false } },
                },
                {
                  key: "gen_ai.usage.prompt_tokens",
                  value: { intValue: { low: 14, high: 0, unsigned: false } },
                },
                {
                  key: "gen_ai.completion.0.finish_reason",
                  value: { stringValue: "stop" },
                },
                {
                  key: "gen_ai.completion.0.role",
                  value: { stringValue: "assistant" },
                },
                {
                  key: "gen_ai.completion.0.content",
                  value: {
                    stringValue:
                      "LLM Observability (Logs, Metrics, and Traces Observability) is a strategy for monitoring and understanding the behavior of applications and systems in real-time. It involves collecting, analyzing, and correlating logs, metrics, and traces from various sources to gain insights into system performance, availability, and overall health.\n\nLogs provide detailed records of events and activities within a system, metrics offer quantitative measurements of system performance, and traces show the flow of requests through a system. By combining these sources of data, organizations can gain a comprehensive view of their systems and applications, identify issues quickly, and optimize performance.\n\nLLM Observability is essential for modern, complex distributed systems as it allows teams to troubleshoot issues, improve system performance, and enhance the overall user experience. It enables organizations to proactively monitor their systems and respond quickly to any issues that may arise.",
                  },
                },
              ],
              status: {},
            },
          ],
        },
      ],
    };

    // When
    const langfuseEvents = convertOtelSpanToIngestionEvent(resourceSpan);

    // Then
    // Will throw an error if the parsing fails
    const parsedEvents = langfuseEvents.map((event) =>
      ingestionEvent.parse(event),
    );
    expect(parsedEvents).toHaveLength(2);
  });
});
