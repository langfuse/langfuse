import {
  OtelIngestionProcessor,
  createIngestionEventSchema,
} from "@langfuse/shared/src/server";

// Test helper function to maintain backward compatibility with existing tests
// This mimics the old convertOtelSpanToIngestionEvent function signature
async function convertOtelSpanToIngestionEvent(
  resourceSpan: any,
  seenTraces: Set<string>,
  publicKey?: string,
) {
  const processor = new OtelIngestionProcessor({
    projectId: "test-project",
    publicKey,
  });

  // For tests, we bypass Redis initialization and directly set the seen traces
  // This is safe because we're testing the conversion logic, not the Redis caching
  (processor as any).seenTraces = seenTraces;
  (processor as any).isInitialized = true;

  return await processor.processToIngestionEvents([resourceSpan]);
}

describe("OTel Resource Span Mapping", () => {
  describe("Langfuse OTEL SDK spans", () => {
    const publicKey = "pk-lf-1234567890";

    it("should convert LF-OTEL spans to LF-events", async () => {
      const langfuseOtelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "telemetry.sdk.language",
                value: { stringValue: "python" },
              },
              {
                key: "telemetry.sdk.name",
                value: { stringValue: "opentelemetry" },
              },
              {
                key: "telemetry.sdk.version",
                value: { stringValue: "1.32.0" },
              },
              {
                key: "langfuse.environment",
                value: { stringValue: "production" },
              },
              { key: "langfuse.release", value: { stringValue: "0.0.1" } },
              {
                key: "service.name",
                value: { stringValue: "unknown_service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "2.60.3",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      44, 206, 24, 247, 232, 205, 6, 90, 11, 78, 99, 78, 239,
                      114, 131, 145,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [87, 240, 37, 84, 23, 151, 65, 189],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [223, 227, 135, 254, 167, 239, 59, 2],
                  },
                  name: "my-generation",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 466848096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467248096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: "generation" },
                    },
                    {
                      key: "langfuse.observation.level",
                      value: { stringValue: "WARNING" },
                    },
                    {
                      key: "langfuse.observation.status_message",
                      value: { stringValue: "nothing to report" },
                    },
                    {
                      key: "langfuse.observation.input",
                      value: {
                        stringValue: '[{"role": "user", "content": "hello"}]',
                      },
                    },
                    {
                      key: "langfuse.observation.output",
                      value: {
                        stringValue:
                          '{"role": "assistant", "content": "what\'s up?"}',
                      },
                    },
                    {
                      key: "langfuse.observation.model.name",
                      value: { stringValue: "gpt-4o" },
                    },
                    {
                      key: "langfuse.observation.prompt.name",
                      value: { stringValue: "my-prompt" },
                    },
                    {
                      key: "langfuse.observation.prompt.version",
                      value: { intValue: { low: 1, high: 0, unsigned: false } },
                    },
                    {
                      key: "langfuse.observation.usage_details",
                      value: {
                        stringValue:
                          '{"input_tokens": 123, "output_tokens": 456}',
                      },
                    },
                    {
                      key: "langfuse.observation.cost_details",
                      value: {
                        stringValue:
                          '{"input_tokens": 0.0001, "output_tokens": 0.002}',
                      },
                    },
                    {
                      key: "langfuse.observation.completion_start_time",
                      value: { stringValue: '"2025-04-30T15:28:50.686390Z"' },
                    },
                    {
                      key: "langfuse.observation.model_parameters",
                      value: {
                        stringValue: '{"temperature": 1, "top_p": "0.2"}',
                      },
                    },
                    {
                      key: "langfuse.observation.metadata.key1",
                      value: { stringValue: '"value1"' },
                    },
                    {
                      key: "langfuse.observation.metadata.key2",
                      value: { stringValue: '"value2"' },
                    },
                    {
                      key: "langfuse.trace.name",
                      value: { stringValue: "test-trace" },
                    },
                    { key: "user.id", value: { stringValue: "my-user" } },
                    { key: "session.id", value: { stringValue: "my-session" } },
                    {
                      key: "langfuse.version",
                      value: { stringValue: "trace-0.0.1" },
                    },
                    {
                      key: "langfuse.trace.input",
                      value: {
                        stringValue: '[{"role": "user", "content": "hello"}]',
                      },
                    },
                    {
                      key: "langfuse.trace.output",
                      value: {
                        stringValue:
                          '{"role": "assistant", "content": "what\'s up?"}',
                      },
                    },
                    {
                      key: "langfuse.trace.tags",
                      value: {
                        arrayValue: { values: [{ stringValue: "tag2" }] },
                      },
                    },
                    {
                      key: "langfuse.trace.public",
                      value: { boolValue: true },
                    },
                    {
                      key: "langfuse.trace.metadata.trace-key1",
                      value: { stringValue: '"value1"' },
                    },
                    {
                      key: "langfuse.trace.metadata.trace-key2",
                      value: { stringValue: '"value2"' },
                    },
                  ],
                  status: {},
                },
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      44, 206, 24, 247, 232, 205, 6, 90, 11, 78, 99, 78, 239,
                      114, 131, 145,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [223, 227, 135, 254, 167, 239, 59, 2],
                  },
                  name: "my-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 205413096,
                    high: 406528574,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 467608096,
                    high: 406528574,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: "span" },
                    },
                    {
                      key: "langfuse.trace.tags",
                      value: {
                        arrayValue: { values: [{ stringValue: "tag1" }] },
                      },
                    },
                    {
                      key: "langfuse.trace.metadata.trace-key0",
                      value: { stringValue: '"value1"' },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = (
        await Promise.all(
          langfuseOtelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();
      const traceEvents = events.filter((e) => e.type === "trace-create");
      const generationEvents = events.filter(
        (e) => e.type === "generation-create",
      );
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(4);
      expect(traceEvents.length).toBe(2);
      expect(spanEvents.length).toBe(1);
      expect(generationEvents.length).toBe(1);

      const spanEvent = spanEvents[0];
      const generationEvent = generationEvents[0];

      const defaultMetadata = {
        resourceAttributes: {
          "langfuse.environment": "production",
          "langfuse.release": "0.0.1",
          "service.name": "unknown_service",
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.32.0",
        },
        scope: {
          name: "langfuse-sdk",
          version: "2.60.3",
        },
      };

      expect(spanEvent.body).toMatchObject({
        id: "dfe387fea7ef3b02",
        traceId: "2cce18f7e8cd065a0b4e634eef728391",
        parentObservationId: null,
        name: "my-span",
        startTime: "2025-04-30T15:28:50.424Z",
        endTime: "2025-04-30T15:28:50.687Z",
        environment: "production",
        metadata: { ...defaultMetadata },
        level: "DEFAULT",
        version: null,
        modelParameters: {},
        model: undefined,
        promptName: null,
        promptVersion: null,
        usageDetails: {},
        costDetails: {},
        input: null,
        output: null,
      });

      expect(generationEvent.body).toMatchObject({
        id: "57f02554179741bd",
        traceId: "2cce18f7e8cd065a0b4e634eef728391",
        parentObservationId: "dfe387fea7ef3b02",
        name: "my-generation",
        startTime: "2025-04-30T15:28:50.686Z",
        endTime: "2025-04-30T15:28:50.686Z",
        environment: "production",
        metadata: { ...defaultMetadata },
        level: "WARNING",
        statusMessage: "nothing to report",
        version: "trace-0.0.1",
        modelParameters: {},
        model: "gpt-4o",
        promptName: "my-prompt",
        promptVersion: 1,
        usageDetails: { input_tokens: 123, output_tokens: 456 },
        costDetails: { input_tokens: 0.0001, output_tokens: 0.002 },
        input: '[{"role": "user", "content": "hello"}]',
        output: '{"role": "assistant", "content": "what\'s up?"}',
      });

      expect(traceEvents[0].body).toMatchObject({
        id: "2cce18f7e8cd065a0b4e634eef728391",
        name: "test-trace",
        tags: ["tag2"],
        userId: "my-user",
        sessionId: "my-session",
        input: '[{"role": "user", "content": "hello"}]',
        output: '{"role": "assistant", "content": "what\'s up?"}',
        version: "trace-0.0.1",
        environment: "production",
        public: true,
        metadata: {
          ...defaultMetadata,
          "trace-key1": '"value1"',
          "trace-key2": '"value2"',
        },
      });

      expect(traceEvents[1].body).toMatchObject({
        id: "2cce18f7e8cd065a0b4e634eef728391",
        timestamp: "2025-04-30T15:28:50.424Z",
        name: "my-span",
        metadata: {
          ...defaultMetadata,
          "trace-key0": '"value1"',
        },
        tags: ["tag1"],
        environment: "production",
      });
    });

    it("should create a trace when as_root has been specified", async () => {
      const langfuseOtelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "telemetry.sdk.language",
                value: { stringValue: "python" },
              },
              {
                key: "telemetry.sdk.name",
                value: { stringValue: "opentelemetry" },
              },
              {
                key: "telemetry.sdk.version",
                value: { stringValue: "1.32.0" },
              },
              {
                key: "langfuse.environment",
                value: { stringValue: "production" },
              },
              { key: "langfuse.release", value: { stringValue: "0.0.1" } },
              {
                key: "service.name",
                value: { stringValue: "unknown_service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "2.60.3",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "my-span-with-custom-trace-id",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: "span" },
                    },
                    {
                      key: "langfuse.internal.as_root",
                      value: { boolValue: true },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = (
        await Promise.all(
          langfuseOtelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();
      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(2);
      expect(traceEvents.length).toBe(1);
      expect(spanEvents.length).toBe(1);

      const spanEvent = spanEvents[0];
      const traceEvent = traceEvents[0];

      expect(spanEvent.body).toMatchObject({
        id: "d43e37b7d17e5476",
        traceId: "95f3b926c7d009925bcb5dbc27311120",
        parentObservationId: "834e28b5917fbef6",
        name: "my-span-with-custom-trace-id",
        startTime: "2025-05-05T13:42:33.936Z",
        endTime: "2025-05-05T13:42:34.038Z",
        environment: "production",
        level: "DEFAULT",
      });

      expect(traceEvent.body).toMatchObject({
        id: "95f3b926c7d009925bcb5dbc27311120",
        timestamp: "2025-05-05T13:42:33.936Z",
        name: "my-span-with-custom-trace-id",
        environment: "production",
      });
    });
  });

  describe("Vendor Spans", () => {
    it("should convert an OpenLit OTel Span to Langfuse Events", async () => {
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
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      // Will throw an error if the parsing fails
      const schema = createIngestionEventSchema();
      const parsedEvents = langfuseEvents.map((event) => schema.parse(event));
      expect(parsedEvents).toHaveLength(2);
    });

    it("should convert a TraceLoop OTel Span to Langfuse Events", async () => {
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
                  {
                    key: "gen_ai.prompt.0.role",
                    value: { stringValue: "user" },
                  },
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
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      // Will throw an error if the parsing fails
      const schema = createIngestionEventSchema();
      const parsedEvents = langfuseEvents.map((event) => schema.parse(event));
      expect(parsedEvents).toHaveLength(2);
    });

    it("LFE-5171: should convert a Semantic Kernel 1.55+ OTel Span with new event-based semantic conventions to Langfuse Events", async () => {
      // Setup - Semantic Kernel 1.55+ uses new event names instead of deprecated gen_ai.content.prompt/completion
      const resourceSpan = {
        scopeSpans: [
          {
            scope: { name: "Microsoft.SemanticKernel" },
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
                name: "chat_completion",
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
                    key: "gen_ai.response.model",
                    value: { stringValue: "gpt-4-0613" },
                  },
                ],
                events: [
                  {
                    timeUnixNano: {
                      low: 1327691067,
                      high: 404677085,
                      unsigned: true,
                    },
                    name: "gen_ai.system.message",
                    attributes: [
                      {
                        key: "content",
                        value: {
                          stringValue: "You are a helpful assistant.",
                        },
                      },
                    ],
                  },
                  {
                    timeUnixNano: {
                      low: 1327691068,
                      high: 404677085,
                      unsigned: true,
                    },
                    name: "gen_ai.user.message",
                    attributes: [
                      {
                        key: "content",
                        value: {
                          stringValue: "What is the capital of France?",
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
                    name: "gen_ai.choice",
                    attributes: [
                      {
                        key: "index",
                        value: {
                          intValue: { low: 0, high: 0, unsigned: false },
                        },
                      },
                      {
                        key: "finish_reason",
                        value: { stringValue: "stop" },
                      },
                      {
                        key: "message",
                        value: {
                          stringValue: JSON.stringify({
                            role: "assistant",
                            content: "The capital of France is Paris.",
                          }),
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
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      // Will throw an error if the parsing fails
      const schema = createIngestionEventSchema();
      const parsedEvents = langfuseEvents.map((event) => schema.parse(event));
      expect(parsedEvents).toHaveLength(2);

      // Check that input contains both system and user messages
      const observationEvent = parsedEvents.find(
        (event) => event.type === "generation-create",
      );
      expect(observationEvent?.body.input).toEqual([
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: "What is the capital of France?",
        },
      ]);

      // Check that output contains the choice
      expect(observationEvent?.body.output).toEqual({
        index: 0,
        finish_reason: "stop",
        message: JSON.stringify({
          role: "assistant",
          content: "The capital of France is Paris.",
        }),
      });
    });

    it("should convert a Vercel AI SDK embedding span to Langfuse embedding-create event", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            scope: { name: "ai" },
            spans: [
              {
                traceId: {
                  type: "Buffer",
                  data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
                },
                spanId: {
                  type: "Buffer",
                  data: [1, 2, 3, 4, 5, 6, 7, 8],
                },
                name: "generate-document-embedding",
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
                    key: "operation.name",
                    value: {
                      stringValue:
                        "ai.embed.doEmbed generate-document-embedding",
                    },
                  },
                  {
                    key: "ai.model.id",
                    value: { stringValue: "gemini-embedding-001" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      const schema = createIngestionEventSchema();
      const parsedEvents = langfuseEvents.map((event) => schema.parse(event));
      expect(parsedEvents).toHaveLength(2); // trace + embedding

      // Should create embedding-create event, not span-create
      const embeddingEvent = parsedEvents.find(
        (event) => event.type === "embedding-create",
      );
      expect(embeddingEvent).toBeDefined();
      expect(embeddingEvent?.body.model).toBe("gemini-embedding-001");
    });
  });

  describe("Property Mapping", () => {
    const defaultSpanProps = {
      traceId: {
        type: "Buffer",
        data: [
          234, 103, 55, 8, 68, 28, 41, 132, 165, 74, 62, 57, 98, 211, 89, 95,
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
    };

    it("should interpret an empty buffer as an unset parentSpanId", async () => {
      // https://github.com/langchain4j/langchain4j/issues/2328#issuecomment-2686129552
      // Empty buffers where detected as truthy, i.e. behaved like they had a parent span.
      // Setup
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                parentSpanId: {
                  type: "Buffer",
                  data: [],
                },
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      // Expect a span and a trace to be created
      expect(langfuseEvents).toHaveLength(2);
    });

    it.each([
      ["CHAIN", "chain-create"],
      ["RETRIEVER", "retriever-create"],
      ["LLM", "generation-create"],
      ["EMBEDDING", "embedding-create"],
      ["AGENT", "agent-create"],
      ["TOOL", "tool-create"],
      ["GUARDRAIL", "guardrail-create"],
      ["EVALUATOR", "evaluator-create"],
      ["", "span-create"],
      ["UnknownKind", "span-create"],
    ])(
      "should map OpenInference %s span kind to %s event",
      async (spanKind, expectedEventType) => {
        const resourceSpan = {
          scopeSpans: [
            {
              spans: [
                {
                  ...defaultSpanProps,
                  attributes: [
                    {
                      key: "openinference.span.kind",
                      value: { stringValue: spanKind },
                    },
                  ],
                },
              ],
            },
          ],
        };

        // When
        const langfuseEvents = await convertOtelSpanToIngestionEvent(
          resourceSpan,
          new Set(),
        );

        // Then
        expect(langfuseEvents).toHaveLength(2); // Should create trace + observation
        expect(
          langfuseEvents.some((event) => event.type === expectedEventType),
        ).toBe(true);

        // Verify the observation has the correct type
        const observationEvent = langfuseEvents.find(
          (event) =>
            event.type.endsWith("-create") && event.type !== "trace-create",
        );
        expect(observationEvent?.type).toBe(expectedEventType);
      },
    );

    it.each([
      ["chat", "generation-create"],
      ["completion", "generation-create"],
      ["generate_content", "generation-create"],
      ["generate", "generation-create"],
      ["embeddings", "embedding-create"],
      ["invoke_agent", "agent-create"],
      ["create_agent", "agent-create"],
      ["execute_tool", "tool-create"],
    ])(
      "should map OTel GenAI %s operation to %s event",
      async (operationName, expectedEventType) => {
        const resourceSpan = {
          scopeSpans: [
            {
              spans: [
                {
                  ...defaultSpanProps,
                  attributes: [
                    {
                      key: "gen_ai.operation.name",
                      value: { stringValue: operationName },
                    },
                  ],
                },
              ],
            },
          ],
        };

        // When
        const langfuseEvents = await convertOtelSpanToIngestionEvent(
          resourceSpan,
          new Set(),
        );

        // Then
        expect(langfuseEvents).toHaveLength(2); // Should create trace + observation
        expect(
          langfuseEvents.some((event) => event.type === expectedEventType),
        ).toBe(true);

        // Verify the observation has the correct type
        const observationEvent = langfuseEvents.find(
          (event) =>
            event.type.endsWith("-create") && event.type !== "trace-create",
        );
        expect(observationEvent?.type).toBe(expectedEventType);
      },
    );

    it.each([
      ["ai.generateText.doGenerate", "generation-create"],
      ["ai.streamText.doStream", "generation-create"],
      ["ai.generateObject", "generation-create"],
      ["ai.generateObject.doGenerate", "generation-create"],
      ["ai.streamObject.doStream", "generation-create"],
      ["ai.embed.doEmbed", "embedding-create"],
      ["ai.embedMany.doEmbed", "embedding-create"],
      ["ai.embed.doEmbed generate-document-embedding", "embedding-create"],
      ["ai.toolCall", "tool-create"],
    ])(
      "should map AI SDK %s operation to %s event",
      async (operationName, expectedEventType) => {
        const resourceSpan = {
          scopeSpans: [
            {
              spans: [
                {
                  ...defaultSpanProps,
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: operationName },
                    },
                    {
                      key: "gen_ai.response.model",
                      value: { stringValue: "gpt-4o" },
                    },
                  ],
                },
              ],
            },
          ],
        };
        // When
        const langfuseEvents = await convertOtelSpanToIngestionEvent(
          resourceSpan,
          new Set(),
        );
        // Then
        expect(langfuseEvents).toHaveLength(2); // Should create trace + observation
        expect(
          langfuseEvents.some((event) => event.type === expectedEventType),
        ).toBe(true);
        // Verify the observation has the correct type
        const observationEvent = langfuseEvents.find(
          (event) =>
            event.type.endsWith("-create") && event.type !== "trace-create",
        );
        expect(observationEvent?.type).toBe(expectedEventType);
      },
    );

    it("should map Pydantic AI tool call to TOOL observation type via gen_ai.tool.* attributes", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";

      const pydanticAiToolSpan = {
        resource: {
          attributes: [
            {
              key: "telemetry.sdk.language",
              value: { stringValue: "python" },
            },
            {
              key: "telemetry.sdk.name",
              value: { stringValue: "opentelemetry" },
            },
            {
              key: "telemetry.sdk.version",
              value: { stringValue: "1.36.0" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "pydantic-ai",
              version: "0.7.4",
              attributes: [],
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from("1234567890abcdef", "hex"),
                parentSpanId: Buffer.from("fedcba0987654321", "hex"),
                name: "tool-call",
                kind: 1,
                startTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 2000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  {
                    key: "gen_ai.tool.name",
                    value: { stringValue: "roulette_wheel" },
                  },
                  {
                    key: "gen_ai.tool.call.id",
                    value: { stringValue: "call_idvalue" },
                  },
                  {
                    key: "tool_arguments",
                    value: { stringValue: '{"square": 18}' },
                  },
                  {
                    key: "tool_response",
                    value: { stringValue: "winner" },
                  },
                  {
                    key: "logfire.msg",
                    value: { stringValue: "running tool: roulette_wheel" },
                  },
                ],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        pydanticAiToolSpan,
        new Set([traceId]),
      );

      const toolObservation = events.find((e) => e.type === "tool-create");

      // Should map to TOOL observation type
      expect(toolObservation).toBeDefined();
      expect(toolObservation?.type).toBe("tool-create");

      // Tool name should come from gen_ai.tool.name
      expect(toolObservation?.body.name).toBe("roulette_wheel");

      // Verify trace structure
      expect(toolObservation?.body.traceId).toBe(traceId);
    });

    it("should prioritize gen_ai.tool.name over logfire.msg for tool observation name", async () => {
      // why? because the logfire.msg value usually has: "running tool: roulette_wheel" whereas the gen_ai.tool.name value is "roulette_wheel"
      // that is cleaner!
      const traceId = "abcdef1234567890abcdef1234567890";

      const toolSpanWithBothNames = {
        resource: {
          attributes: [
            {
              key: "telemetry.sdk.language",
              value: { stringValue: "python" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "pydantic-ai",
              version: "0.7.4",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from("1234567890abcdef", "hex"),
                name: "span-name",
                kind: 1,
                startTimeUnixNano: { low: 1000000, high: 406528574 },
                endTimeUnixNano: { low: 2000000, high: 406528574 },
                attributes: [
                  {
                    key: "gen_ai.tool.name",
                    value: { stringValue: "correct_tool_name" },
                  },
                  {
                    key: "gen_ai.tool.call.id",
                    value: { stringValue: "call_123" },
                  },
                  {
                    key: "logfire.msg",
                    value: { stringValue: "wrong name from logfire" },
                  },
                ],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        toolSpanWithBothNames,
        new Set([traceId]),
      );

      const toolObservation = events.find((e) => e.type === "tool-create");

      // Should use gen_ai.tool.name, NOT logfire.msg
      expect(toolObservation?.body.name).toBe("correct_tool_name");
    });

    it("should map Pydantic AI agent root span with final_result as output and pydantic_ai.all_messages as input", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";

      const allMessages = [
        {
          role: "system",
          parts: [
            {
              type: "text",
              content:
                "Use the `roulette_wheel` function to see if the customer has won based on the number they provide.",
            },
          ],
        },
        {
          role: "user",
          parts: [{ type: "text", content: "Put my money on square eighteen" }],
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: "call_fXo9X5qrViUJgNdVh0bzyD31",
              name: "roulette_wheel",
              arguments: { square: 18 },
            },
          ],
          finish_reason: "tool_call",
        },
        {
          role: "user",
          parts: [
            {
              type: "tool_call_response",
              id: "call_fXo9X5qrViUJgNdVh0bzyD31",
              name: "roulette_wheel",
              result: "winner",
            },
          ],
        },
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              content:
                "Congratulations! You've won by placing your bet on square eighteen. 🎉",
            },
          ],
          finish_reason: "stop",
        },
      ];

      const pydanticAiRootSpan = {
        resource: {
          attributes: [
            {
              key: "telemetry.sdk.language",
              value: { stringValue: "python" },
            },
            {
              key: "telemetry.sdk.name",
              value: { stringValue: "opentelemetry" },
            },
            {
              key: "telemetry.sdk.version",
              value: { stringValue: "1.39.1" },
            },
            {
              key: "service.name",
              value: { stringValue: "openclaw-gateway" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "pydantic-ai",
              version: "1.60.0",
              attributes: [],
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from("1234567890abcdef", "hex"),
                // No parentSpanId — this is a root span
                name: "roulette_agent run",
                kind: 1,
                startTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 2000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  {
                    key: "model_name",
                    value: { stringValue: "gpt-4o" },
                  },
                  {
                    key: "agent_name",
                    value: { stringValue: "roulette_agent" },
                  },
                  {
                    key: "gen_ai.agent.name",
                    value: { stringValue: "roulette_agent" },
                  },
                  {
                    key: "logfire.msg",
                    value: { stringValue: "roulette_agent run" },
                  },
                  {
                    key: "final_result",
                    value: {
                      stringValue:
                        "Congratulations! You've won by placing your bet on square eighteen. 🎉",
                    },
                  },
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { stringValue: "174" },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { stringValue: "31" },
                  },
                  {
                    key: "pydantic_ai.all_messages",
                    value: {
                      stringValue: JSON.stringify(allMessages),
                    },
                  },
                ],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        pydanticAiRootSpan,
        new Set(),
      );

      // Root span should produce a trace-create and a span-create
      const traceEvent = events.find((e) => e.type === "trace-create");
      const observationEvent = events.find((e) => e.type === "span-create");

      expect(traceEvent).toBeDefined();
      expect(observationEvent).toBeDefined();

      // Trace should have input (all_messages as JSON string) and output (final_result)
      expect(traceEvent?.body.input).toBe(JSON.stringify(allMessages));
      expect(traceEvent?.body.output).toBe(
        "Congratulations! You've won by placing your bet on square eighteen. 🎉",
      );

      // Observation should also have input and output
      expect(observationEvent?.body.input).toBe(JSON.stringify(allMessages));
      expect(observationEvent?.body.output).toBe(
        "Congratulations! You've won by placing your bet on square eighteen. 🎉",
      );

      // Name should come from logfire.msg
      expect(observationEvent?.body.name).toBe("roulette_agent run");

      // Verify final_result and pydantic_ai.all_messages are NOT duplicated in metadata.attributes
      const metadataAttributes =
        observationEvent?.body.metadata?.attributes ?? {};
      expect(metadataAttributes).not.toHaveProperty("final_result");
      expect(metadataAttributes).not.toHaveProperty("pydantic_ai.all_messages");
    });

    it("should prioritize OpenInference over OTel GenAI and model detection", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                attributes: [
                  {
                    key: "openinference.span.kind",
                    value: { stringValue: "TOOL" }, // Should be tool-create
                  },
                  {
                    key: "gen_ai.operation.name", // Would normally trigger generation
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "gen_ai.request.model", // Would normally trigger generation
                    value: { stringValue: "gpt-4" },
                  },
                ],
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      expect(langfuseEvents).toHaveLength(2);
      // Should be tool-create, NOT generation-create (OpenInference takes priority)
      expect(langfuseEvents.some((event) => event.type === "tool-create")).toBe(
        true,
      );
      expect(
        langfuseEvents.some((event) => event.type === "generation-create"),
      ).toBe(false);
    });

    it("should prioritize OTel GenAI over model-based detection", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "embeddings" }, // Should be embedding-create
                  },
                  {
                    key: "gen_ai.request.model", // Would normally trigger generation
                    value: { stringValue: "gpt-4" },
                  },
                ],
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      expect(langfuseEvents).toHaveLength(2);
      // Should be embedding-create, NOT generation-create (OTel GenAI takes priority over model detection)
      expect(
        langfuseEvents.some((event) => event.type === "embedding-create"),
      ).toBe(true);
      expect(
        langfuseEvents.some((event) => event.type === "generation-create"),
      ).toBe(false);
    });

    it("should trust Langfuse type over OpenInference or model detection", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                attributes: [
                  // Explicit Langfuse type (should always win)
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "span" },
                  },
                  // OpenInference span kind
                  {
                    key: "openinference.span.kind",
                    value: { stringValue: "Agent" },
                  },
                  // Model indicators
                  {
                    key: "gen_ai.request.model",
                    value: { stringValue: "gpt-4" },
                  },
                ],
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      expect(langfuseEvents).toHaveLength(2);
      // Explicit Langfuse type should always win over inferred types
      expect(langfuseEvents.some((event) => event.type === "span-create")).toBe(
        true,
      );
      expect(
        langfuseEvents.some((event) => event.type === "agent-create"),
      ).toBe(false);
      expect(
        langfuseEvents.some((event) => event.type === "generation-create"),
      ).toBe(false);
    });

    it("should trust OpenInference over model detection but keep model attributes", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                attributes: [
                  // OpenInference span kind (should take priority over model detection)
                  {
                    key: "openinference.span.kind",
                    value: { stringValue: "RETRIEVER" },
                  },
                  // Model indicators (would be fallback)
                  {
                    key: "gen_ai.request.model",
                    value: { stringValue: "text-embedding-ada-002" },
                  },
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: { low: 50, high: 0, unsigned: false } },
                  },
                ],
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      expect(langfuseEvents).toHaveLength(2);
      // OpenInference should win over model detection
      expect(
        langfuseEvents.some((event) => event.type === "retriever-create"),
      ).toBe(true);
      expect(
        langfuseEvents.some((event) => event.type === "generation-create"),
      ).toBe(false);

      // Should still extract model and usage info
      const retrieverEvent = langfuseEvents.find(
        (event) => event.type === "retriever-create",
      );
      expect(retrieverEvent?.body.model).toBe("text-embedding-ada-002");
      expect(retrieverEvent?.body.usageDetails.input).toBe(50);
    });

    it("should map tool-call spans with empty model-related attributes to span-create (not generation-create)", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                name: "tool-call",
                attributes: [
                  { key: "model", value: { stringValue: "" } },
                  { key: "provided_model_name", value: { stringValue: "" } },
                  { key: "internal_model_id", value: { stringValue: "" } },
                  { key: "model_parameters", value: { stringValue: "{}" } },
                  {
                    key: "provided_usage_details",
                    value: { stringValue: "{}" },
                  },
                  { key: "usage_details", value: { stringValue: "{}" } },
                  {
                    key: "provided_cost_details",
                    value: { stringValue: "{}" },
                  },
                  { key: "cost_details", value: { stringValue: "{}" } },
                  { key: "total_cost", value: { stringValue: "" } },
                  { key: "completion_start_time", value: { stringValue: "" } },
                  { key: "prompt_id", value: { stringValue: "" } },
                  { key: "prompt_name", value: { stringValue: "" } },
                  { key: "prompt_version", value: { stringValue: "" } },
                  { key: "token_count", value: { stringValue: "" } },
                ],
              },
            ],
          },
        ],
      };

      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      const observationEvent = langfuseEvents.find(
        (event) => event.type !== "trace-create",
      );

      // Tool-call spans with empty model-related attributes should remain as span-create
      expect(observationEvent?.type).toBe("span-create");
    });

    it("should use logfire.msg as span name", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                name: "wrong name",
                attributes: [
                  {
                    key: "logfire.msg",
                    value: { stringValue: "right name" },
                  },
                ],
              },
            ],
          },
        ],
      };

      // When
      const langfuseEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      // Then
      expect(langfuseEvents[0].body.name).toBe("right name");
      expect(langfuseEvents[1].body.name).toBe("right name");
    });

    it.each([
      [
        "should cast input_tokens from string to number",
        {
          entity: "observation",
          otelAttributeKey: "langfuse.observation.completion_start_time",
          otelAttributeValue: {
            stringValue: "2025-09-17T22:16:28.152000+02:00",
          },
          entityAttributeKey: "completionStartTime",
          entityAttributeValue: "2025-09-17T22:16:28.152000+02:00",
        },
      ],
      [
        "should handle non-stringified completion start time correctly",
        {
          entity: "observation",
          otelAttributeKey: "langfuse.observation.completion_start_time",
          otelAttributeValue: {
            stringValue: "2025-10-01T08:45:26.112648Z",
          },
          entityAttributeKey: "completionStartTime",
          entityAttributeValue: "2025-10-01T08:45:26.112648Z",
        },
      ],
      [
        "should handle double-stringified completion start time correctly",
        {
          entity: "observation",
          otelAttributeKey: "langfuse.observation.completion_start_time",
          otelAttributeValue: {
            stringValue: '"2025-10-01T08:45:26.112648Z"',
          },
          entityAttributeKey: "completionStartTime",
          entityAttributeValue: "2025-10-01T08:45:26.112648Z",
        },
      ],
      [
        "should cast input_tokens from string to number",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.input_tokens",
          otelAttributeValue: { stringValue: "15" },
          entityAttributeKey: "usageDetails.input",
          entityAttributeValue: 15,
        },
      ],
      [
        "should extract environment on trace for langfuse.environment",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.environment",
          otelAttributeValue: { stringValue: "test" },
          entityAttributeKey: "environment",
          entityAttributeValue: "test",
        },
      ],
      [
        "should extract environment on observation for deployment.environment.name",
        {
          entity: "observation",
          otelAttributeKey: "deployment.environment.name",
          otelAttributeValue: { stringValue: "test" },
          entityAttributeKey: "environment",
          entityAttributeValue: "test",
        },
      ],
      [
        "should fallback to default on observation if no environment present",
        {
          entity: "observation",
          otelAttributeKey: "unused.key",
          otelAttributeValue: { stringValue: "" },
          entityAttributeKey: "environment",
          entityAttributeValue: "default",
        },
      ],
      [
        "should extract promptName on observation from langfuse.prompt.name",
        {
          entity: "observation",
          otelAttributeKey: "langfuse.prompt.name",
          otelAttributeValue: { stringValue: "test" },
          entityAttributeKey: "promptName",
          entityAttributeValue: "test",
        },
      ],
      [
        "should extract public on trace from langfuse.public",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.public",
          otelAttributeValue: { boolValue: true },
          entityAttributeKey: "public",
          entityAttributeValue: true,
        },
      ],
      [
        "should not treat truthy values as public true",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.public",
          otelAttributeValue: { stringValue: "false" },
          entityAttributeKey: "public",
          entityAttributeValue: false,
        },
      ],
      [
        "should extract userId on trace from user.id",
        {
          entity: "trace",
          otelAttributeKey: "user.id",
          otelAttributeValue: { stringValue: "user-1" },
          entityAttributeKey: "userId",
          entityAttributeValue: "user-1",
        },
      ],
      [
        "should extract userId on trace from langfuse.user.id",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.user.id",
          otelAttributeValue: { stringValue: "user-1" },
          entityAttributeKey: "userId",
          entityAttributeValue: "user-1",
        },
      ],
      [
        "should extract sessionId on trace from session.id",
        {
          entity: "trace",
          otelAttributeKey: "session.id",
          otelAttributeValue: { stringValue: "session-1" },
          entityAttributeKey: "sessionId",
          entityAttributeValue: "session-1",
        },
      ],
      [
        "should extract sessionId on trace from langfuse.session.id",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.session.id",
          otelAttributeValue: { stringValue: "session-1" },
          entityAttributeKey: "sessionId",
          entityAttributeValue: "session-1",
        },
      ],
      [
        "should extract sessionId on trace from gen_ai.conversation.id",
        {
          entity: "trace",
          otelAttributeKey: "gen_ai.conversation.id",
          otelAttributeValue: { stringValue: "conversation-1" },
          entityAttributeKey: "sessionId",
          entityAttributeValue: "conversation-1",
        },
      ],
      [
        "should extract providedModelName from gen_ai.request.model",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.request.model",
          otelAttributeValue: { stringValue: "gpt-4" },
          entityAttributeKey: "model",
          entityAttributeValue: "gpt-4",
        },
      ],
      [
        "should extract providedModelName from ai.model.id",
        {
          entity: "observation",
          otelAttributeKey: "ai.model.id",
          otelAttributeValue: { stringValue: "gemini-embedding-001" },
          entityAttributeKey: "model",
          entityAttributeValue: "gemini-embedding-001",
        },
      ],
      [
        "should extract providedModelName from llm.model_name",
        {
          entity: "observation",
          otelAttributeKey: "llm.model_name",
          otelAttributeValue: { stringValue: "gpt-4" },
          entityAttributeKey: "model",
          entityAttributeValue: "gpt-4",
        },
      ],
      [
        "should extract modelParameters from gen_ai.request (request.temperature)",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.request.temperature",
          otelAttributeValue: { doubleValue: 1 },
          entityAttributeKey: "modelParameters.temperature",
          entityAttributeValue: 1,
        },
      ],
      [
        "should extract modelParameters from gen_ai.request (request.max_tokens)",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.request.max_tokens",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "modelParameters.max_tokens",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract usage from llm.token_count (input_tokens)",
        {
          entity: "observation",
          otelAttributeKey: "llm.token_count.prompt",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.input",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract usage from gen_ai.usage (input_tokens)",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.input_tokens",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.input",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract usage from gen_ai.usage (completion_tokens)",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.completion_tokens",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.output",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract usage from gen_ai.usage (total_tokens)",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.total_tokens",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.total",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract usage from gen_ai.usage (custom_tokens)",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.custom_tokens",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.custom_tokens",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract cost from gen_ai.usage.cost",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.cost",
          otelAttributeValue: {
            doubleValue: 0.000151,
          },
          entityAttributeKey: "costDetails.total",
          entityAttributeValue: 0.000151,
        },
      ],
      [
        "should not treat usage.cost as usage",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.usage.cost",
          otelAttributeValue: {
            doubleValue: 0.000151,
          },
          entityAttributeKey: "usageDetails.cost",
          entityAttributeValue: undefined,
        },
      ],
      [
        "should map gen_ai.prompt.0.content to input[0].content",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.prompt.0.content",
          otelAttributeValue: {
            stringValue: "What is LLM Observability?",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [{ content: "What is LLM Observability?" }],
        },
      ],
      [
        "should map gen_ai.completion.0.content to output[0].content",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.completion.0.content",
          otelAttributeValue: {
            stringValue: "Observing LLMs",
          },
          entityAttributeKey: "output",
          entityAttributeValue: [{ content: "Observing LLMs" }],
        },
      ],
      [
        "should map gen_ai.completion.content to output.content",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.completion.content",
          otelAttributeValue: {
            stringValue: "Observing LLMs",
          },
          entityAttributeKey: "output",
          entityAttributeValue: { content: "Observing LLMs" },
        },
      ],
      [
        "should map gen_ai.completion to output",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.completion",
          otelAttributeValue: {
            stringValue: "Observing LLMs",
          },
          entityAttributeKey: "output",
          entityAttributeValue: "Observing LLMs",
        },
      ],
      [
        "should map mlflow.spanInputs to input",
        {
          entity: "observation",
          otelAttributeKey: "mlflow.spanInputs",
          otelAttributeValue: {
            stringValue: JSON.stringify({
              question: "What is LLM Observability?",
            }),
          },
          entityAttributeKey: "input",
          entityAttributeValue: JSON.stringify({
            question: "What is LLM Observability?",
          }),
        },
      ],
      [
        "should map model to model",
        {
          entity: "observation",
          otelAttributeKey: "model",
          otelAttributeValue: {
            stringValue: "gpt-4o-mini",
          },
          entityAttributeKey: "model",
          entityAttributeValue: "gpt-4o-mini",
        },
      ],
      [
        "#6084: should map input to input for pydantic",
        {
          entity: "observation",
          otelAttributeKey: "input",
          otelAttributeValue: {
            stringValue: JSON.stringify({
              task: "Play some chess",
              stream: false,
            }),
          },
          entityAttributeKey: "input",
          entityAttributeValue: JSON.stringify({
            task: "Play some chess",
            stream: false,
          }),
        },
      ],
      [
        "#6084: should map model_config to modelParameters",
        {
          entity: "observation",
          otelAttributeKey: "model_config",
          otelAttributeValue: {
            stringValue: '{"max_tokens": 4096}',
          },
          entityAttributeKey: "modelParameters.max_tokens",
          entityAttributeValue: 4096,
        },
      ],
      [
        "#5412: should map input.value to input for smolagents",
        {
          entity: "observation",
          otelAttributeKey: "input.value",
          otelAttributeValue: {
            stringValue: JSON.stringify({
              task: "Play some chess",
              stream: false,
            }),
          },
          entityAttributeKey: "input",
          entityAttributeValue: JSON.stringify({
            task: "Play some chess",
            stream: false,
          }),
        },
      ],
      [
        "#5412: should map llm.token_count.completion to provided_usage_details.output",
        {
          entity: "observation",
          otelAttributeKey: "llm.token_count.completion",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.output",
          entityAttributeValue: 100,
        },
      ],
      [
        "#5412: should map llm.token_count.total to provided_usage_details.total",
        {
          entity: "observation",
          otelAttributeKey: "llm.token_count.total",
          otelAttributeValue: {
            intValue: { low: 100, high: 0, unsigned: false },
          },
          entityAttributeKey: "usageDetails.total",
          entityAttributeValue: 100,
        },
      ],
      [
        "#5412: should map llm.invocation_parameters to modelParameters",
        {
          entity: "observation",
          otelAttributeKey: "llm.invocation_parameters",
          otelAttributeValue: {
            stringValue: '{"max_tokens": 4096}',
          },
          entityAttributeKey: "modelParameters.max_tokens",
          entityAttributeValue: 4096,
        },
      ],
      [
        "should extract Bedrock cache read tokens from ai.response.providerMetadata",
        {
          entity: "observation",
          otelAttributeKey: "ai.response.providerMetadata",
          otelAttributeValue: {
            stringValue:
              '{"bedrock":{"usage":{"cacheReadInputTokens":4482,"cacheWriteInputTokens":0,"cacheCreationInputTokens":100}}}',
          },
          entityAttributeKey: "usageDetails.input_cache_read",
          entityAttributeValue: 4482,
        },
      ],
      [
        "should extract Bedrock cache write tokens from ai.response.providerMetadata",
        {
          entity: "observation",
          otelAttributeKey: "ai.response.providerMetadata",
          otelAttributeValue: {
            stringValue:
              '{"bedrock":{"usage":{"cacheReadInputTokens":4482,"cacheWriteInputTokens":50,"cacheCreationInputTokens":100}}}',
          },
          entityAttributeKey: "usageDetails.input_cache_write",
          entityAttributeValue: 50,
        },
      ],
      [
        "should extract Bedrock cache creation tokens from ai.response.providerMetadata",
        {
          entity: "observation",
          otelAttributeKey: "ai.response.providerMetadata",
          otelAttributeValue: {
            stringValue:
              '{"bedrock":{"usage":{"cacheReadInputTokens":4482,"cacheWriteInputTokens":0,"cacheCreationInputTokens":100}}}',
          },
          entityAttributeKey: "usageDetails.input_cache_creation",
          entityAttributeValue: 100,
        },
      ],
      [
        "should extract llm.input_messages.message.content to input",
        {
          entity: "observation",
          otelAttributeKey: "llm.input_messages.0.message.content",
          otelAttributeValue: {
            stringValue: "Hello, how are you?",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            { message: { content: "Hello, how are you?" } },
          ],
        },
      ],
      [
        "should extract llm.input_messages.message.role to input",
        {
          entity: "observation",
          otelAttributeKey: "llm.input_messages.0.message.role",
          otelAttributeValue: {
            stringValue: "system",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [{ message: { role: "system" } }],
        },
      ],
      [
        "should extract llm.output_messages.message.content to output",
        {
          entity: "observation",
          otelAttributeKey: "llm.output_messages.0.message.content",
          otelAttributeValue: {
            stringValue: "Hello, how are you?",
          },
          entityAttributeKey: "output",
          entityAttributeValue: [
            { message: { content: "Hello, how are you?" } },
          ],
        },
      ],
      [
        "#5457: should map traceloop.entity.input to input",
        {
          entity: "trace",
          otelAttributeKey: "traceloop.entity.input",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "input",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map langfuse.metadata string to top-level metadata for trace",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.metadata",
          otelAttributeValue: {
            stringValue: '{"customer_id": "123", "experiment": "test-run-1"}',
          },
          entityAttributeKey: "metadata.customer_id",
          entityAttributeValue: "123",
        },
      ],
      [
        "should map langfuse.metadata string to top-level metadata for observation",
        {
          entity: "observation",
          otelAttributeKey: "langfuse.metadata",
          otelAttributeValue: {
            stringValue: '{"customer_id": "123", "experiment": "test-run-1"}',
          },
          entityAttributeKey: "metadata.customer_id",
          entityAttributeValue: "123",
        },
      ],
      [
        "should extract metadata from langfuse.metadata.* keys for trace",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.metadata.user_type",
          otelAttributeValue: {
            stringValue: "premium",
          },
          entityAttributeKey: "metadata.user_type",
          entityAttributeValue: "premium",
        },
      ],
      [
        "should extract metadata from langfuse.metadata.* keys for observation",
        {
          entity: "observation",
          otelAttributeKey: "langfuse.metadata.user_type",
          otelAttributeValue: {
            stringValue: "premium",
          },
          entityAttributeKey: "metadata.user_type",
          entityAttributeValue: "premium",
        },
      ],
      [
        "should extract tags from single string from langfuse.tags to trace",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.tags",
          otelAttributeValue: {
            stringValue: "2",
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["2"],
        },
      ],
      [
        "should extract array input on trace event attributes",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.tags",
          otelAttributeValue: {
            arrayValue: {
              values: [
                {
                  stringValue: "2",
                },
              ],
            },
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["2"],
        },
      ],
      [
        "should extract array input tags to trace",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.tags",
          otelAttributeValue: {
            stringValue: '["2"]',
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["2"],
        },
      ],
      [
        "should extract array csv input tags to trace",
        {
          entity: "trace",
          otelAttributeKey: "langfuse.tags",
          otelAttributeValue: {
            stringValue: "2,3,4",
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["2", "3", "4"],
        },
      ],
      [
        "should extract tags from tag.tags single string to trace",
        {
          entity: "trace",
          otelAttributeKey: "tag.tags",
          otelAttributeValue: {
            stringValue: "llamaindex",
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["llamaindex"],
        },
      ],
      [
        "should extract tags from tag.tags array value to trace",
        {
          entity: "trace",
          otelAttributeKey: "tag.tags",
          otelAttributeValue: {
            arrayValue: {
              values: [
                {
                  stringValue: "llamaindex",
                },
                {
                  stringValue: "rag",
                },
              ],
            },
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["llamaindex", "rag"],
        },
      ],
      [
        "should extract tags from tag.tags JSON string array to trace",
        {
          entity: "trace",
          otelAttributeKey: "tag.tags",
          otelAttributeValue: {
            stringValue: '["llamaindex", "rag", "production"]',
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["llamaindex", "rag", "production"],
        },
      ],
      [
        "should extract tags from tag.tags comma-separated string to trace",
        {
          entity: "trace",
          otelAttributeKey: "tag.tags",
          otelAttributeValue: {
            stringValue: "llamaindex, rag, production",
          },
          entityAttributeKey: "tags",
          entityAttributeValue: ["llamaindex", "rag", "production"],
        },
      ],
      [
        "should map gen_ai.input.messages to input",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.input.messages",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "input",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map gen_ai.output.messages to output",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.output.messages",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "output",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map gen_ai.tool.call.arguments to input",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.tool.call.arguments",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "input",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map gen_ai.tool.call.result to output",
        {
          entity: "observation",
          otelAttributeKey: "gen_ai.tool.call.result",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "output",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map gcp.vertex.agent.tool_call_args to input",
        {
          entity: "observation",
          otelAttributeKey: "gcp.vertex.agent.tool_call_args",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "input",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map gcp.vertex.agent.tool_response to output",
        {
          entity: "observation",
          otelAttributeKey: "gcp.vertex.agent.tool_response",
          otelAttributeValue: {
            stringValue: '{"foo": "bar"}',
          },
          entityAttributeKey: "output",
          entityAttributeValue: '{"foo": "bar"}',
        },
      ],
      [
        "should map pydantic-ai tool_arguments to input",
        {
          entity: "observation",
          otelAttributeKey: "tool_arguments",
          otelAttributeValue: {
            stringValue:
              '{"query": "What is the weather like?", "location": "New York"}',
          },
          entityAttributeKey: "input",
          entityAttributeValue:
            '{"query": "What is the weather like?", "location": "New York"}',
        },
      ],
      [
        "should map pydantic-ai tool_response to output",
        {
          entity: "observation",
          otelAttributeKey: "tool_response",
          otelAttributeValue: {
            stringValue: '{"result": "Sunny, 22°C"}',
          },
          entityAttributeKey: "output",
          entityAttributeValue: '{"result": "Sunny, 22°C"}',
        },
      ],
      [
        "should map lk.input_text to input",
        {
          entity: "observation",
          otelAttributeKey: "lk.input_text",
          otelAttributeValue: {
            stringValue: "What is the weather today?",
          },
          entityAttributeKey: "input",
          entityAttributeValue: "What is the weather today?",
        },
      ],
      [
        "should map lk.response.text to output",
        {
          entity: "observation",
          otelAttributeKey: "lk.response.text",
          otelAttributeValue: {
            stringValue: "The weather is sunny with a high of 75°F.",
          },
          entityAttributeKey: "output",
          entityAttributeValue: "The weather is sunny with a high of 75°F.",
        },
      ],
      [
        "should map lk.function_tool.output to output",
        {
          entity: "observation",
          otelAttributeKey: "lk.function_tool.output",
          otelAttributeValue: {
            stringValue: '{"temperature": 75, "condition": "sunny"}',
          },
          entityAttributeKey: "output",
          entityAttributeValue: '{"temperature": 75, "condition": "sunny"}',
        },
      ],
    ])(
      "Attributes: %s",
      async (
        _name: string,
        spec: {
          entity: string;
          otelAttributeKey: string;
          otelAttributeValue: any;
          entityAttributeKey: string;
          entityAttributeValue: any;
        },
      ) => {
        // Setup
        // Check if this test needs the "ai" scope (Vercel AI SDK attributes)
        const needsAiScope =
          spec.otelAttributeKey.startsWith("ai.") ||
          spec.otelAttributeKey.startsWith("pydantic-ai.");

        const resourceSpan = {
          scopeSpans: [
            {
              ...(needsAiScope && {
                scope: {
                  name: "ai",
                  version: "4.0.0",
                },
              }),
              spans: [
                {
                  ...defaultSpanProps,
                  attributes: [
                    {
                      key: spec.otelAttributeKey,
                      value: spec.otelAttributeValue,
                    },
                  ],
                },
              ],
            },
          ],
        };

        // When
        const langfuseEvents = await convertOtelSpanToIngestionEvent(
          resourceSpan,
          new Set(),
        );

        // Then
        const entity: { body: Record<string, any> } =
          spec.entity === "trace" ? langfuseEvents[0] : langfuseEvents[1];
        expect(
          spec.entityAttributeKey // This logic allows to follow a path in the object, e.g. foo.bar.baz.
            .split(".")
            .reduce((acc: any, key: string) => acc && acc[key], entity.body),
        ).toEqual(spec.entityAttributeValue);
      },
    );

    it.each([
      [
        "should extract version on trace from resource attribute service.version",
        {
          entity: "trace",
          otelResourceAttributeKey: "service.version",
          otelResourceAttributeValue: { stringValue: "1.0.5" },
          entityAttributeKey: "version",
          entityAttributeValue: "1.0.5",
        },
      ],
      [
        "should extract environment on trace for langfuse.environment",
        {
          entity: "trace",
          otelResourceAttributeKey: "langfuse.environment",
          otelResourceAttributeValue: { stringValue: "test" },
          entityAttributeKey: "environment",
          entityAttributeValue: "test",
        },
      ],
      [
        "should extract environment on observation for deployment.environment.name",
        {
          entity: "observation",
          otelResourceAttributeKey: "deployment.environment.name",
          otelResourceAttributeValue: { stringValue: "test" },
          entityAttributeKey: "environment",
          entityAttributeValue: "test",
        },
      ],
      [
        "should fallback to default on observation if no environment present",
        {
          entity: "observation",
          otelResourceAttributeKey: "unused.key",
          otelResourceAttributeValue: { stringValue: "" },
          entityAttributeKey: "environment",
          entityAttributeValue: "default",
        },
      ],
      [
        "should extract metadata from resource attributes",
        {
          entity: "observation",
          otelResourceAttributeKey: "langfuse.metadata",
          otelResourceAttributeValue: {
            stringValue: '{"resource_id": "xyz", "region": "us-west-2"}',
          },
          entityAttributeKey: "metadata.resource_id",
          entityAttributeValue: "xyz",
        },
      ],
      [
        "should extract metadata from langfuse.metadata.* resource attributes",
        {
          entity: "observation",
          otelResourceAttributeKey: "langfuse.metadata.server_name",
          otelResourceAttributeValue: {
            stringValue: "web-server-01",
          },
          entityAttributeKey: "metadata.server_name",
          entityAttributeValue: "web-server-01",
        },
      ],
    ])(
      "ResourceAttributes: %s",
      async (
        _name: string,
        spec: {
          entity: string;
          otelResourceAttributeKey: string;
          otelResourceAttributeValue: any;
          entityAttributeKey: string;
          entityAttributeValue: any;
        },
      ) => {
        // Setup
        const resourceSpan = {
          resource: {
            attributes: [
              {
                key: spec.otelResourceAttributeKey,
                value: spec.otelResourceAttributeValue,
              },
            ],
          },
          scopeSpans: [
            {
              spans: [defaultSpanProps],
            },
          ],
        };

        // When
        const langfuseEvents = await convertOtelSpanToIngestionEvent(
          resourceSpan,
          new Set(),
        );

        // Then
        const entity: { body: Record<string, any> } =
          spec.entity === "trace" ? langfuseEvents[0] : langfuseEvents[1];
        expect(
          spec.entityAttributeKey // This logic allows to follow a path in the object, e.g. foo.bar.baz.
            .split(".")
            .reduce((acc: any, key: string) => acc && acc[key], entity.body),
        ).toEqual(spec.entityAttributeValue);
      },
    );

    it.each([
      [
        "should extract input on trace from event attributes",
        {
          entity: "trace",
          otelEventName: "gen_ai.content.prompt",
          otelEventAttributeKey: "gen_ai.prompt",
          otelEventAttributeValue: {
            stringValue: "user: What is LLM Observability?",
          },
          entityAttributeKey: "input",
          entityAttributeValue: "user: What is LLM Observability?",
        },
      ],
      [
        "should extract array input on trace event attributes",
        {
          entity: "trace",
          otelEventName: "gen_ai.content.prompt",
          otelEventAttributeKey: "gen_ai.prompt",
          otelEventAttributeValue: {
            arrayValue: {
              values: [
                {
                  stringValue: "Reply with the word 'java'",
                },
              ],
            },
          },
          entityAttributeKey: "input",
          entityAttributeValue: ["Reply with the word 'java'"],
        },
      ],
      [
        "should extract output on observation from event attributes",
        {
          entity: "observation",
          otelEventName: "gen_ai.content.completion",
          otelEventAttributeKey: "gen_ai.completion",
          otelEventAttributeValue: {
            stringValue:
              "assistant: LLM Observability stands for logs, metrics, and traces observability.",
          },
          entityAttributeKey: "output",
          entityAttributeValue:
            "assistant: LLM Observability stands for logs, metrics, and traces observability.",
        },
      ],
      [
        "should extract output on observation from event attributes even if no gen_ai.completion attribute is available",
        {
          entity: "observation",
          otelEventName: "gen_ai.content.completion",
          otelEventAttributeKey: "gen_ai.something_else",
          otelEventAttributeValue: {
            stringValue:
              "assistant: LLM Observability stands for logs, metrics, and traces observability.",
          },
          entityAttributeKey: "output",
          entityAttributeValue: {
            "gen_ai.something_else":
              "assistant: LLM Observability stands for logs, metrics, and traces observability.",
          },
        },
      ],
      // Semantic Kernel 1.55+ new event-based semantic conventions
      [
        "should extract input from gen_ai.system.message event",
        {
          entity: "observation",
          otelEventName: "gen_ai.system.message",
          otelEventAttributeKey: "content",
          otelEventAttributeValue: {
            stringValue: "You are a helpful assistant.",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            {
              role: "system",
              content: "You are a helpful assistant.",
            },
          ],
        },
      ],
      [
        "should extract input from gen_ai.user.message event",
        {
          entity: "observation",
          otelEventName: "gen_ai.user.message",
          otelEventAttributeKey: "content",
          otelEventAttributeValue: {
            stringValue: "What is the capital of France?",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            {
              role: "user",
              content: "What is the capital of France?",
            },
          ],
        },
      ],
      [
        "should extract input from gen_ai.assistant.message event with tool_calls",
        {
          entity: "observation",
          otelEventName: "gen_ai.assistant.message",
          otelEventAttributeKey: "tool_calls",
          otelEventAttributeValue: {
            stringValue: JSON.stringify([
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"location": "Paris"}',
                },
              },
            ]),
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            {
              role: "assistant",
              tool_calls: JSON.stringify([
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location": "Paris"}',
                  },
                },
              ]),
            },
          ],
        },
      ],
      [
        "should extract input from gen_ai.tool.message event",
        {
          entity: "observation",
          otelEventName: "gen_ai.tool.message",
          otelEventAttributeKey: "content",
          otelEventAttributeValue: {
            stringValue: "Sunny, 22°C",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            {
              role: "tool",
              content: "Sunny, 22°C",
            },
          ],
        },
      ],
      [
        "should extract output from gen_ai.choice event",
        {
          entity: "observation",
          otelEventName: "gen_ai.choice",
          otelEventAttributeKey: "message",
          otelEventAttributeValue: {
            stringValue: JSON.stringify({
              role: "assistant",
              content: "The capital of France is Paris.",
            }),
          },
          entityAttributeKey: "output",
          entityAttributeValue: {
            message: JSON.stringify({
              role: "assistant",
              content: "The capital of France is Paris.",
            }),
          },
        },
      ],
      [
        "should extract output from gen_ai.choice event with finish_reason",
        {
          entity: "observation",
          otelEventName: "gen_ai.choice",
          otelEventAttributeKey: "finish_reason",
          otelEventAttributeValue: {
            stringValue: "stop",
          },
          entityAttributeKey: "output",
          entityAttributeValue: {
            finish_reason: "stop",
          },
        },
      ],
      [
        "should extract input from gen_ai.tool.message event with id attribute",
        {
          entity: "observation",
          otelEventName: "gen_ai.tool.message",
          otelEventAttributeKey: "id",
          otelEventAttributeValue: {
            stringValue: "call_456",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            {
              role: "tool",
              id: "call_456",
            },
          ],
        },
      ],
      [
        "should extract output from gen_ai.choice event with index attribute",
        {
          entity: "observation",
          otelEventName: "gen_ai.choice",
          otelEventAttributeKey: "index",
          otelEventAttributeValue: {
            intValue: { low: 0, high: 0, unsigned: false },
          },
          entityAttributeKey: "output",
          entityAttributeValue: {
            index: 0,
          },
        },
      ],
      [
        "should extract input from gen_ai.assistant.message event with content",
        {
          entity: "observation",
          otelEventName: "gen_ai.assistant.message",
          otelEventAttributeKey: "content",
          otelEventAttributeValue: {
            stringValue: "I'll help you with that.",
          },
          entityAttributeKey: "input",
          entityAttributeValue: [
            {
              role: "assistant",
              content: "I'll help you with that.",
            },
          ],
        },
      ],
    ])(
      "Events: %s",
      async (
        _name: string,
        spec: {
          entity: string;
          otelEventName: string;
          otelEventAttributeKey: string;
          otelEventAttributeValue: any;
          entityAttributeKey: string;
          entityAttributeValue: any;
        },
      ) => {
        // Setup
        const resourceSpan = {
          resource: {},
          scopeSpans: [
            {
              spans: [
                {
                  ...defaultSpanProps,
                  events: [
                    {
                      timeUnixNano: {
                        low: 1327691067,
                        high: 404677085,
                        unsigned: true,
                      },
                      name: spec.otelEventName,
                      attributes: [
                        {
                          key: spec.otelEventAttributeKey,
                          value: spec.otelEventAttributeValue,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };

        // When
        const langfuseEvents = await convertOtelSpanToIngestionEvent(
          resourceSpan,
          new Set(),
        );

        // Then
        const entity: { body: Record<string, any> } =
          spec.entity === "trace" ? langfuseEvents[0] : langfuseEvents[1];
        expect(entity.body[spec.entityAttributeKey]).toEqual(
          spec.entityAttributeValue,
        );
      },
    );

    it("should map llm.input_messages and llm.output_messages to input/output and filter from metadata", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const rootSpanId = "1234567890abcdef";

      const openInferenceSpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "agno-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "openinference",
              version: "1.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(rootSpanId, "hex"),
                name: "llm-call",
                kind: 1,
                startTimeUnixNano: { low: 0, high: 406528574, unsigned: true },
                endTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  // OpenInference llm.input_messages format (used by Agno, BeeAI, etc.)
                  {
                    key: "llm.input_messages.0.message.role",
                    value: { stringValue: "system" },
                  },
                  {
                    key: "llm.input_messages.0.message.content",
                    value: { stringValue: "You are a helpful assistant." },
                  },
                  {
                    key: "llm.input_messages.1.message.role",
                    value: { stringValue: "user" },
                  },
                  {
                    key: "llm.input_messages.1.message.content",
                    value: { stringValue: "What is the weather today?" },
                  },
                  // OpenInference llm.output_messages format
                  {
                    key: "llm.output_messages.0.message.role",
                    value: { stringValue: "assistant" },
                  },
                  {
                    key: "llm.output_messages.0.message.content",
                    value: {
                      stringValue:
                        "I don't have access to real-time weather data.",
                    },
                  },
                  // Custom attributes (should remain in metadata.attributes)
                  {
                    key: "custom_attribute",
                    value: { stringValue: "should_be_preserved" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        openInferenceSpan,
        new Set(),
      );

      const observation = events.find(
        (e) => e.type.endsWith("-create") && e.type !== "trace-create",
      );

      // Verify input is extracted and structured as a nested array
      expect(observation?.body.input).toBeDefined();
      const inputParsed =
        typeof observation?.body.input === "string"
          ? JSON.parse(observation.body.input)
          : observation?.body.input;
      expect(Array.isArray(inputParsed)).toBe(true);
      expect(inputParsed[0].message.role).toBe("system");
      expect(inputParsed[0].message.content).toBe(
        "You are a helpful assistant.",
      );
      expect(inputParsed[1].message.role).toBe("user");
      expect(inputParsed[1].message.content).toBe("What is the weather today?");

      // Verify output is extracted and structured as a nested array
      expect(observation?.body.output).toBeDefined();
      const outputParsed =
        typeof observation?.body.output === "string"
          ? JSON.parse(observation.body.output)
          : observation?.body.output;
      expect(Array.isArray(outputParsed)).toBe(true);
      expect(outputParsed[0].message.role).toBe("assistant");
      expect(outputParsed[0].message.content).toBe(
        "I don't have access to real-time weather data.",
      );

      // Verify llm.input_messages.* and llm.output_messages.* are NOT in metadata.attributes
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.input_messages.0.message.role"
        ],
      ).toBeUndefined();
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.input_messages.0.message.content"
        ],
      ).toBeUndefined();
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.input_messages.1.message.role"
        ],
      ).toBeUndefined();
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.input_messages.1.message.content"
        ],
      ).toBeUndefined();
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.output_messages.0.message.role"
        ],
      ).toBeUndefined();
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.output_messages.0.message.content"
        ],
      ).toBeUndefined();

      // Verify custom attributes ARE in metadata.attributes
      expect(observation?.body.metadata?.attributes?.custom_attribute).toBe(
        "should_be_preserved",
      );
    });

    it("should filter all input/output attribute patterns from metadata.attributes while preserving custom attributes", async () => {
      // This test verifies that extractInputAndOutput's filteredAttributes correctly removes
      // all known input/output attribute patterns from multiple frameworks
      const traceId = "abcdef1234567890abcdef1234567890";
      const rootSpanId = "1234567890abcdef";

      const multiFrameworkSpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "test-scope",
              version: "1.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(rootSpanId, "hex"),
                name: "multi-framework-span",
                kind: 1,
                startTimeUnixNano: { low: 0, high: 406528574, unsigned: true },
                endTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  // Input attribute that will be mapped
                  {
                    key: "input",
                    value: { stringValue: '{"query": "test input"}' },
                  },
                  // gen_ai.prompt.* pattern (should be filtered)
                  {
                    key: "gen_ai.prompt.0.content",
                    value: { stringValue: "prompt content" },
                  },
                  // gen_ai.completion.* pattern (should be filtered)
                  {
                    key: "gen_ai.completion.0.content",
                    value: { stringValue: "completion content" },
                  },
                  // llm.input_messages.* pattern (should be filtered)
                  {
                    key: "llm.input_messages.0.message.role",
                    value: { stringValue: "user" },
                  },
                  // llm.output_messages.* pattern (should be filtered)
                  {
                    key: "llm.output_messages.0.message.role",
                    value: { stringValue: "assistant" },
                  },
                  // Custom attributes (should be preserved)
                  {
                    key: "custom.request_id",
                    value: { stringValue: "req-12345" },
                  },
                  {
                    key: "deployment.region",
                    value: { stringValue: "us-west-2" },
                  },
                  {
                    key: "model.version",
                    value: { stringValue: "v2.0" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        multiFrameworkSpan,
        new Set(),
      );

      const observation = events.find(
        (e) => e.type.endsWith("-create") && e.type !== "trace-create",
      );

      // Verify input was extracted
      expect(observation?.body.input).toBe('{"query": "test input"}');

      // Verify input attribute is filtered from metadata
      expect(observation?.body.metadata?.attributes?.input).toBeUndefined();

      // Verify gen_ai.prompt.* attributes are filtered
      expect(
        observation?.body.metadata?.attributes?.["gen_ai.prompt.0.content"],
      ).toBeUndefined();

      // Verify gen_ai.completion.* attributes are filtered
      expect(
        observation?.body.metadata?.attributes?.["gen_ai.completion.0.content"],
      ).toBeUndefined();

      // Verify llm.input_messages.* attributes are filtered
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.input_messages.0.message.role"
        ],
      ).toBeUndefined();

      // Verify llm.output_messages.* attributes are filtered
      expect(
        observation?.body.metadata?.attributes?.[
          "llm.output_messages.0.message.role"
        ],
      ).toBeUndefined();

      // Verify custom attributes ARE preserved in metadata.attributes
      expect(
        observation?.body.metadata?.attributes?.["custom.request_id"],
      ).toBe("req-12345");
      expect(
        observation?.body.metadata?.attributes?.["deployment.region"],
      ).toBe("us-west-2");
      expect(observation?.body.metadata?.attributes?.["model.version"]).toBe(
        "v2.0",
      );
    });
  });

  describe("Span Counting", () => {
    it("should count spans correctly across multiple resource spans", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      const resourceSpans = [
        {
          scopeSpans: [
            { spans: [{}, {}, {}] }, // 3 spans
            { spans: [{}] }, // 1 span
          ],
        },
        {
          scopeSpans: [
            { spans: [{}, {}] }, // 2 spans
          ],
        },
      ];

      // Access private method for testing
      const count = (processor as any).getTotalSpanCount(resourceSpans);
      expect(count).toBe(6);
    });

    it("should handle empty resource spans", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      const count = (processor as any).getTotalSpanCount([]);
      expect(count).toBe(0);
    });

    it("should handle null/undefined resource spans", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      expect((processor as any).getTotalSpanCount(null)).toBe(0);
      expect((processor as any).getTotalSpanCount(undefined)).toBe(0);
    });

    it("should handle malformed resource spans", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      const resourceSpans = [
        { scopeSpans: null },
        { scopeSpans: undefined },
        { scopeSpans: [] },
        {
          scopeSpans: [
            { spans: null },
            { spans: undefined },
            { spans: [] },
            { spans: [{}, {}] }, // 2 valid spans
          ],
        },
      ];

      const count = (processor as any).getTotalSpanCount(resourceSpans);
      expect(count).toBe(2);
    });

    it("should return 0 for non-array input", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      expect((processor as any).getTotalSpanCount("not-an-array")).toBe(0);
      expect((processor as any).getTotalSpanCount({})).toBe(0);
      expect((processor as any).getTotalSpanCount(123)).toBe(0);
    });

    it("should handle deeply nested null/undefined structures", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      const resourceSpans = [
        null,
        undefined,
        {},
        { scopeSpans: [null, undefined, {}] },
        {
          scopeSpans: [
            { spans: [{}, {}] }, // 2 valid spans
          ],
        },
      ];

      const count = (processor as any).getTotalSpanCount(resourceSpans);
      expect(count).toBe(2);
    });

    it("should return -1 and not throw on unexpected errors", () => {
      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });

      // Create a malicious object that throws when accessed
      const maliciousResourceSpan = {
        get scopeSpans() {
          throw new Error("Malicious property access");
        },
      };

      const count = (processor as any).getTotalSpanCount([
        maliciousResourceSpan,
      ]);
      expect(count).toBe(-1);
    });
  });

  describe("Timestamp Conversion", () => {
    it("should correctly convert OpenTelemetry timestamps to ISO strings", () => {
      // Test case with positive low value
      const positiveTimestamp = {
        low: 1095848032,
        high: 406260507,
        unsigned: true,
      };

      // Test case with negative low value
      const negativeTimestamp = {
        low: -1431863980,
        high: 406260507,
        unsigned: true,
      };

      // Expected ISO strings based on the provided mapping
      const expectedStartTime = "2025-04-17T07:39:52.317Z";
      const expectedEndTime = "2025-04-17T07:39:54.084Z";

      // Convert timestamps to ISO strings
      const actualStartTime =
        OtelIngestionProcessor.convertNanoTimestampToISO(positiveTimestamp);
      const actualEndTime =
        OtelIngestionProcessor.convertNanoTimestampToISO(negativeTimestamp);

      // Verify conversions match expected values
      expect(actualStartTime).toBe(expectedStartTime);
      expect(actualEndTime).toBe(expectedEndTime);
    });

    it("should handle various timestamp formats correctly", () => {
      // Test with string timestamp (nanoseconds)
      const stringTimestamp = "1744317592317227000"; // Same as positiveTimestamp above
      const expectedStringResult = "2025-04-10T20:39:52.317Z";
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(stringTimestamp),
      ).toBe(expectedStringResult);

      // Test with zero timestamp
      const zeroTimestamp = {
        low: 0,
        high: 0,
        unsigned: true,
      };
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(zeroTimestamp),
      ).toBe("1970-01-01T00:00:00.000Z");
    });

    it("should return undefined for missing or invalid timestamps", () => {
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(undefined as any),
      ).toBeUndefined();
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(null as any),
      ).toBeUndefined();
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(""),
      ).toBeUndefined();
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO("not-a-timestamp"),
      ).toBeUndefined();
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(NaN),
      ).toBeUndefined();
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO(
          Number.POSITIVE_INFINITY,
        ),
      ).toBeUndefined();
      expect(
        OtelIngestionProcessor.convertNanoTimestampToISO({
          high: 1,
        } as any),
      ).toBeUndefined();
    });
  });

  describe("Missing span timestamps", () => {
    it("should process spans with no start/end times without throwing", async () => {
      const resourceSpan = {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: "test" } }],
        },
        scopeSpans: [
          {
            scope: {
              name: "test-scope",
              version: "1.0.0",
            },
            spans: [
              {
                traceId: "2cce18f7e8cd065a0b4e634eef728391",
                spanId: "57f0255417974100",
                name: "span-without-time",
                kind: 1,
                attributes: [],
                status: {},
              },
            ],
          },
        ],
      };

      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });
      const eventInputs = processor.processToEvent([resourceSpan]);
      expect(eventInputs).toHaveLength(1);
      expect(eventInputs[0].startTimeISO).toBeDefined();
      expect(eventInputs[0].endTimeISO).toBeDefined();
      expect(eventInputs[0].startTimeISO).toBe(eventInputs[0].endTimeISO);

      const ingestionEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );

      const trace = ingestionEvents.find((e) => e.type === "trace-create");
      const observation = ingestionEvents.find((e) => e.type === "span-create");

      expect(trace).toBeDefined();
      expect(trace?.body.timestamp).toBeDefined();
      expect(observation).toBeDefined();
      expect(observation?.body.startTime).toBeDefined();
      expect(observation?.body.endTime).toBeDefined();
      expect(observation?.body.startTime).toBe(observation?.body.endTime);
    });

    it("should use the present timestamp as fallback when only one edge is missing", async () => {
      const endOnlyTimestamp = {
        low: 467248096,
        high: 406528574,
        unsigned: true,
      };
      const expectedISO =
        OtelIngestionProcessor.convertNanoTimestampToISO(endOnlyTimestamp);

      const resourceSpan = {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: "test" } }],
        },
        scopeSpans: [
          {
            scope: {
              name: "test-scope",
              version: "1.0.0",
            },
            spans: [
              {
                traceId: "2cce18f7e8cd065a0b4e634eef728391",
                spanId: "57f0255417974100",
                name: "span-end-only-time",
                kind: 1,
                endTimeUnixNano: endOnlyTimestamp,
                attributes: [],
                status: {},
              },
            ],
          },
        ],
      };

      const processor = new OtelIngestionProcessor({
        projectId: "test-project",
      });
      const eventInputs = processor.processToEvent([resourceSpan]);
      expect(eventInputs).toHaveLength(1);
      expect(eventInputs[0].startTimeISO).toBe(expectedISO);
      expect(eventInputs[0].endTimeISO).toBe(expectedISO);

      const ingestionEvents = await convertOtelSpanToIngestionEvent(
        resourceSpan,
        new Set(),
      );
      const observation = ingestionEvents.find((e) => e.type === "span-create");
      expect(observation?.body.startTime).toBe(expectedISO);
      expect(observation?.body.endTime).toBe(expectedISO);
    });
  });

  describe("Trace seen logic", () => {
    const publicKey = "pk-lf-1234567890";

    it("should create a shallow trace when seenTraces set is empty for non-root span without trace updates", async () => {
      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "test-operation" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      // Empty seenTraces set - should create shallow trace for first span
      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(2);
      expect(traceEvents.length).toBe(1);
      expect(spanEvents.length).toBe(1);

      const traceEvent = traceEvents[0];

      // Should create shallow trace with minimal information
      expect(traceEvent.body).toMatchObject({
        id: "95f3b926c7d009925bcb5dbc27311120",
        timestamp: "2025-05-05T13:42:33.936Z",
        environment: "default",
      });

      // Should NOT have name, metadata, etc. since it's a shallow trace
      expect(traceEvent.body.name).toBeUndefined();
      expect(traceEvent.body.metadata).toBeUndefined();
      expect(traceEvent.body.userId).toBeUndefined();
      expect(traceEvent.body.sessionId).toBeUndefined();
    });

    it("should NOT create trace when seenTraces set contains the traceId", async () => {
      const traceId = "95f3b926c7d009925bcb5dbc27311120";
      const seenTraces = new Set([traceId]);

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "test-operation" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      // seenTraces contains the traceId - should NOT create trace
      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(
                span,
                seenTraces,
                publicKey,
              ),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(1);
      expect(traceEvents.length).toBe(0); // No trace should be created
      expect(spanEvents.length).toBe(1); // Only span should be created

      const spanEvent = spanEvents[0];
      expect(spanEvent.body).toMatchObject({
        id: "d43e37b7d17e5476",
        traceId: "95f3b926c7d009925bcb5dbc27311120",
        parentObservationId: "834e28b5917fbef6",
        name: "child-span",
      });
    });

    it("should create full trace for root span even when seenTraces contains traceId", async () => {
      const traceId = "95f3b926c7d009925bcb5dbc27311120";
      const seenTraces = new Set([traceId]);

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  // No parentSpanId - makes it a root span
                  name: "root-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "root-operation" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      // seenTraces contains the traceId, but span is root - should still create full trace
      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(
                span,
                seenTraces,
                publicKey,
              ),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(2);
      expect(traceEvents.length).toBe(1); // Trace should be created because it's root span
      expect(spanEvents.length).toBe(1);

      const traceEvent = traceEvents[0];

      // Should create full trace with name and metadata since it's a root span
      expect(traceEvent.body).toMatchObject({
        id: "95f3b926c7d009925bcb5dbc27311120",
        timestamp: "2025-05-05T13:42:33.936Z",
        name: "root-span",
        environment: "default",
      });

      expect(traceEvent.body.metadata).toBeDefined();
    });

    it("should create trace-create event when span has trace_metadata with user_id, session_id, and tags", async () => {
      const traceId = "95f3b926c7d009925bcb5dbc27311120";
      const seenTraces = new Set([traceId]);

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.trace.metadata.langfuse_user_id",
                      value: { stringValue: "user-123" },
                    },
                    {
                      key: "langfuse.trace.metadata.langfuse_session_id",
                      value: { stringValue: "session-456" },
                    },
                    {
                      key: "langfuse.trace.metadata.langfuse_tags",
                      value: { stringValue: "tag1,tag2" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(
                span,
                seenTraces,
                publicKey,
              ),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      expect(traceEvents.length).toBe(1);
      expect(traceEvents[0].body.userId).toBe("user-123");
      expect(traceEvents[0].body.sessionId).toBe("session-456");
      expect(traceEvents[0].body.tags).toEqual(["tag1", "tag2"]);
    });

    it("should create trace-create event when span has observation_metadata with user_id, session_id, and tags", async () => {
      const traceId = "95f3b926c7d009925bcb5dbc27311120";
      const seenTraces = new Set([traceId]);

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.observation.metadata.langfuse_user_id",
                      value: { stringValue: "user-789" },
                    },
                    {
                      key: "langfuse.observation.metadata.langfuse_session_id",
                      value: { stringValue: "session-abc" },
                    },
                    {
                      key: "langfuse.observation.metadata.langfuse_tags",
                      value: { stringValue: "tag3,tag4" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(
                span,
                seenTraces,
                publicKey,
              ),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      expect(traceEvents.length).toBe(1);
      expect(traceEvents[0].body.userId).toBe("user-789");
      expect(traceEvents[0].body.sessionId).toBe("session-abc");
      expect(traceEvents[0].body.tags).toEqual(["tag3", "tag4"]);
    });

    it("should create full trace for span with trace updates even when seenTraces contains traceId", async () => {
      const traceId = "95f3b926c7d009925bcb5dbc27311120";
      const seenTraces = new Set([traceId]);

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "child-span-with-trace-updates",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.trace.name",
                      value: { stringValue: "Custom Trace Name" },
                    },
                    {
                      key: "user.id",
                      value: { stringValue: "user-123" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      // seenTraces contains the traceId, but span has trace updates - should still create full trace
      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(
                span,
                seenTraces,
                publicKey,
              ),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(2);
      expect(traceEvents.length).toBe(1); // Trace should be created because it has trace updates
      expect(spanEvents.length).toBe(1);

      const traceEvent = traceEvents[0];

      // Should create full trace with trace updates
      expect(traceEvent.body).toMatchObject({
        id: "95f3b926c7d009925bcb5dbc27311120",
        timestamp: "2025-05-05T13:42:33.936Z",
        name: "Custom Trace Name",
        userId: "user-123",
        environment: "default",
      });

      expect(traceEvent.body.metadata).toBeDefined();
    });

    it("should create only ONE trace when multiple spans share the same traceId with empty seenTraces", async () => {
      const sharedTraceId = [
        149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39, 49, 17, 32,
      ];

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: sharedTraceId,
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "first-child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "first-operation" },
                    },
                  ],
                  status: {},
                },
                {
                  traceId: {
                    type: "Buffer",
                    data: sharedTraceId,
                  },
                  spanId: {
                    type: "Buffer",
                    data: [180, 95, 123, 45, 67, 89, 101, 112],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "second-child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1150000000,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1250000000,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "second-operation" },
                    },
                  ],
                  status: {},
                },
                {
                  traceId: {
                    type: "Buffer",
                    data: sharedTraceId,
                  },
                  spanId: {
                    type: "Buffer",
                    data: [200, 100, 150, 75, 25, 50, 175, 225],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "third-child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1260000000,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1360000000,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "third-operation" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      // Empty seenTraces set - should create only ONE trace despite multiple spans with same traceId
      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(4); // 1 trace + 3 spans
      expect(traceEvents.length).toBe(1); // Only ONE trace should be created
      expect(spanEvents.length).toBe(3); // All three spans should be created

      const traceEvent = traceEvents[0];

      // Should create shallow trace with minimal information (from first span processed)
      expect(traceEvent.body).toMatchObject({
        id: "95f3b926c7d009925bcb5dbc27311120",
        timestamp: "2025-05-05T13:42:33.936Z", // timestamp from first span
        environment: "default",
      });

      // Verify all spans were created with the same traceId
      spanEvents.forEach((spanEvent) => {
        expect(spanEvent.body.traceId).toBe("95f3b926c7d009925bcb5dbc27311120");
      });

      // Verify span names are correct
      expect(spanEvents[0].body.name).toBe("first-child-span");
      expect(spanEvents[1].body.name).toBe("second-child-span");
      expect(spanEvents[2].body.name).toBe("third-child-span");
    });

    it("should filter out shallow traces when full traces exist for the same traceId in same batch", async () => {
      const sharedTraceId = [
        149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39, 49, 17, 32,
      ];

      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                // First span: non-root, no trace updates (will create shallow trace)
                {
                  traceId: {
                    type: "Buffer",
                    data: sharedTraceId,
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  parentSpanId: {
                    type: "Buffer",
                    data: [131, 78, 40, 181, 145, 127, 190, 246],
                  },
                  name: "child-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
                // Second span: root span (will create full trace)
                {
                  traceId: {
                    type: "Buffer",
                    data: sharedTraceId,
                  },
                  spanId: {
                    type: "Buffer",
                    data: [180, 95, 123, 45, 67, 89, 101, 112],
                  },
                  // No parentSpanId = root span
                  name: "root-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1150000000,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1250000000,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      // Empty seenTraces set - both spans would normally create traces
      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();

      const traceEvents = events.filter((e) => e.type === "trace-create");
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(events.length).toBe(3); // 1 trace + 2 spans (shallow trace filtered out)
      expect(traceEvents.length).toBe(1); // Only ONE trace should remain after filtering
      expect(spanEvents.length).toBe(2); // Both spans should be created

      const traceEvent = traceEvents[0];

      // Should be the FULL trace (from root span), not the shallow one
      expect(traceEvent.body).toMatchObject({
        id: "95f3b926c7d009925bcb5dbc27311120",
        name: "root-span", // Full trace has name
        environment: "default",
      });

      // Should have metadata (indicates it's a full trace, not shallow)
      expect(traceEvent.body.metadata).toBeDefined();

      // Verify both spans were created
      expect(spanEvents[0].body.name).toBe("child-span");
      expect(spanEvents[1].body.name).toBe("root-span");
    });

    it("should prioritize langfuse.session.id over gen_ai.conversation.id when both are present", async () => {
      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  name: "root-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.session.id",
                      value: { stringValue: "langfuse-session-123" },
                    },
                    {
                      key: "gen_ai.conversation.id",
                      value: { stringValue: "otel-conversation-456" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();

      const traceEvent = events.find((e) => e.type === "trace-create");
      expect(traceEvent).toBeDefined();
      expect(traceEvent.body.sessionId).toBe("langfuse-session-123");
    });

    it("should prioritize session.id over gen_ai.conversation.id when both are present", async () => {
      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: { stringValue: "test-service" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "test-scope",
                version: "1.0.0",
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                      49, 17, 32,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [212, 62, 55, 183, 209, 126, 84, 118],
                  },
                  name: "root-span",
                  kind: 1,
                  startTimeUnixNano: {
                    low: 1047784088,
                    high: 406627672,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: 1149405088,
                    high: 406627672,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "session.id",
                      value: { stringValue: "session-id-123" },
                    },
                    {
                      key: "gen_ai.conversation.id",
                      value: { stringValue: "otel-conversation-456" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = (
        await Promise.all(
          otelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        )
      ).flat();

      const traceEvent = events.find((e) => e.type === "trace-create");
      expect(traceEvent).toBeDefined();
      expect(traceEvent.body.sessionId).toBe("session-id-123");
    });

    it("should default to span-create for unknown observation type", async () => {
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "test-scope" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                  name: "test-span",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: "invalid_type" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );
      const spanEvents = events.filter((e) => e.type === "span-create");

      expect(spanEvents.length).toBe(1);
      expect(spanEvents[0].body.name).toBe("test-span");
    });

    it("should respect explicit observation types", async () => {
      // Test that explicit observation types (agent, evaluator, etc.) are respected
      // even when spans have generation-like properties (e.g., model names)
      const observationTypes = [
        { type: "agent", expectedEventType: "agent-create" },
        { type: "evaluator", expectedEventType: "evaluator-create" },
        { type: "tool", expectedEventType: "tool-create" },
        { type: "retriever", expectedEventType: "retriever-create" },
        { type: "embedding", expectedEventType: "embedding-create" },
        { type: "guardrail", expectedEventType: "guardrail-create" },
      ];

      for (const { type, expectedEventType } of observationTypes) {
        const otelSpans = [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                scope: { name: "test-scope" },
                spans: [
                  {
                    traceId: {
                      data: [
                        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                      ],
                    },
                    spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                    name: `test-${type}`,
                    startTimeUnixNano: 1000000000,
                    endTimeUnixNano: 2000000000,
                    attributes: [
                      {
                        key: "langfuse.observation.type",
                        value: { stringValue: type },
                      },
                      // Add model name to trigger generation heuristic
                      {
                        key: "langfuse.observation.model.name",
                        value: { stringValue: "gpt-4" },
                      },
                      // Add other generation-like properties
                      {
                        key: "gen_ai.request.model",
                        value: { stringValue: "gpt-4" },
                      },
                      {
                        key: "openinference.span.kind",
                        value: { stringValue: "LLM" },
                      },
                    ],
                    status: {},
                  },
                ],
              },
            ],
          },
        ];

        const events = await convertOtelSpanToIngestionEvent(
          otelSpans[0],
          new Set(),
          publicKey,
        );

        // Should create the specific observation type, NOT generation-create
        const observationEvents = events.filter(
          (e) => e.type === expectedEventType,
        );
        const generationEvents = events.filter(
          (e) => e.type === "generation-create",
        );

        expect(observationEvents.length).toBe(1);
        expect(generationEvents.length).toBe(0);
        expect(observationEvents[0].body.name).toBe(`test-${type}`);
        expect(observationEvents[0].body.model).toBe("gpt-4");
      }
    });

    it("should fall back to generation-create for model names without explicit type", async () => {
      // Ensure model name heuristic still works when no explicit type is provided
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "test-scope" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                  name: "test-llm-call",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    // No explicit observation type
                    {
                      key: "langfuse.observation.model.name",
                      value: { stringValue: "gpt-4" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      const generationEvents = events.filter(
        (e) => e.type === "generation-create",
      );
      expect(generationEvents.length).toBe(1);
      expect(generationEvents[0].body.name).toBe("test-llm-call");
      expect(generationEvents[0].body.model).toBe("gpt-4");
    });

    it("should default to span-create when no mapper can handle the attributes", async () => {
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "test-scope" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: {
                    data: [1, 2, 3, 4, 5, 6, 7, 8],
                  },
                  name: "unknown-operation",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    // No openinference.span.kind, no model indicators, no explicit type
                    {
                      key: "custom.attribute",
                      value: { stringValue: "some-value" },
                    },
                    {
                      key: "service.name",
                      value: { stringValue: "my-service" },
                    },
                    {
                      key: "operation.type",
                      value: { stringValue: "unknown" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      // Should create a span-create event (default when no mapping found)
      const spanEvents = events.filter((e) => e.type === "span-create");
      expect(spanEvents.length).toBe(1);
      expect(spanEvents[0].body.name).toBe("unknown-operation");

      // Should not create any generation-create or other typed events
      const nonSpanEvents = events.filter(
        (e) => e.type !== "span-create" && e.type !== "trace-create",
      );
      expect(nonSpanEvents.length).toBe(0);

      // Should still create a trace
      const traceEvents = events.filter((e) => e.type === "trace-create");
      expect(traceEvents.length).toBe(1);
    });

    it("should map Vercel AI SDK toolCall to tool-create", async () => {
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "ai" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                  name: "ai.toolCall",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    {
                      key: "operation.name",
                      value: {
                        stringValue: "ai.toolCall MyAgent.MyLLM.myFunction",
                      },
                    },
                    {
                      key: "resource.name",
                      value: { stringValue: "MyAgent.MyLLM.myFunction" },
                    },
                    {
                      key: "ai.operationId",
                      value: { stringValue: "ai.toolCall" },
                    },
                    {
                      key: "ai.toolCall.name",
                      value: { stringValue: "myTool" },
                    },
                    {
                      key: "ai.toolCall.id",
                      value: { stringValue: "call_abc123" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      const toolEvents = events.filter((e) => e.type === "tool-create");
      expect(toolEvents.length).toBe(1);
    });

    it("should map Vercel AI SDK toolCall using ai.operationId alone (without operation.name)", async () => {
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "ai" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                  name: "tool-execution",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    {
                      key: "ai.operationId",
                      value: { stringValue: "ai.toolCall" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      const toolEvents = events.filter((e) => e.type === "tool-create");
      expect(toolEvents.length).toBe(1);
    });

    it("should map Vercel AI SDK generation WITH model to generation-create", async () => {
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "ai" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                  name: "text-generation",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "ai.generateText" },
                    },
                    {
                      key: "gen_ai.response.model",
                      value: { stringValue: "gpt-4" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      const generationEvents = events.filter(
        (e) => e.type === "generation-create",
      );
      expect(generationEvents.length).toBe(1);
    });

    it("should fallback to span-create for AI SDK generation WITHOUT model", async () => {
      const otelSpans = [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "ai" },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                  name: "text-generation",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    {
                      key: "operation.name",
                      value: { stringValue: "ai.generateText" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      const spanEvents = events.filter((e) => e.type === "span-create");
      const generationEvents = events.filter(
        (e) => e.type === "generation-create",
      );
      expect(spanEvents.length).toBe(1);
      expect(generationEvents.length).toBe(0);
    });

    it("should override the observation type if it is declared as 'span' but holds generation-like attributes for python-sdk <= 3.3.0", async () => {
      // Issue: https://github.com/langfuse/langfuse/issues/8682
      const otelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "telemetry.sdk.language",
                value: { stringValue: "python" },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: "langfuse-sdk",
                version: "3.3.0",
                attributes: [
                  {
                    key: "public_key",
                    value: { stringValue: "pk-lf-1234567890" },
                  },
                ],
              },
              spans: [
                {
                  traceId: {
                    data: [
                      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                    ],
                  },
                  spanId: {
                    data: [1, 2, 3, 4, 5, 6, 7, 8],
                  },
                  name: "unknown-operation",
                  startTimeUnixNano: 1000000000,
                  endTimeUnixNano: 2000000000,
                  attributes: [
                    // No openinference.span.kind, no model indicators, no explicit type
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: "span" },
                    },
                    {
                      key: "langfuse.observation.model.name",
                      value: { stringValue: "gpt-4o" },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      const events = await convertOtelSpanToIngestionEvent(
        otelSpans[0],
        new Set(),
        publicKey,
      );

      // Should create a span-create event (default when no mapping found)
      const spanEvents = events.filter((e) => e.type === "generation-create");
      expect(spanEvents.length).toBe(1);
      expect(spanEvents[0].body.name).toBe("unknown-operation");

      // Should not create any span-create or other typed events
      const nonSpanEvents = events.filter(
        (e) => e.type !== "generation-create" && e.type !== "trace-create",
      );
      expect(nonSpanEvents.length).toBe(0);

      // Should still create a trace
      const traceEvents = events.filter((e) => e.type === "trace-create");
      expect(traceEvents.length).toBe(1);
    });

    it.skip("should not overwrite existing trace metadata when child span has trace updates", async () => {
      // skipped because it's not really getting the trace and it's metadata to check
      const traceId = "95f3b926c7d009925bcb5dbc27311120";

      // 1. Root span creates trace with original metadata
      const rootSpan = {
        scopeSpans: [
          {
            scope: {
              name: "openinference.instrumentation.google_adk",
            },
            spans: [
              {
                traceId: {
                  data: [
                    149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                    49, 17, 32,
                  ],
                },
                spanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                name: "root-span",
                startTimeUnixNano: { low: 1, high: 1 },
                endTimeUnixNano: { low: 2, high: 1 },
                attributes: [
                  {
                    key: "langfuse.trace.name",
                    value: { stringValue: "Original Name" },
                  },
                  {
                    key: "langfuse.session.id",
                    value: { stringValue: "original-session" },
                  },
                  {
                    key: "original_span_attribute",
                    value: { stringValue: "should_be_preserved" },
                  },
                ],
              },
            ],
          },
        ],
      };

      // 2. Child span with trace updates but different span attributes
      const childSpan = {
        scopeSpans: [
          {
            scope: {
              name: "openinference.instrumentation.google_adk",
            },
            spans: [
              {
                traceId: {
                  data: [
                    149, 243, 185, 38, 199, 208, 9, 146, 91, 203, 93, 188, 39,
                    49, 17, 32,
                  ],
                },
                spanId: { data: [2, 2, 3, 4, 5, 6, 7, 8] },
                parentSpanId: { data: [1, 2, 3, 4, 5, 6, 7, 8] },
                name: "child-span",
                startTimeUnixNano: { low: 1, high: 1 },
                endTimeUnixNano: { low: 2, high: 1 },
                attributes: [
                  {
                    key: "langfuse.trace.name",
                    value: { stringValue: "Updated Name" },
                  }, // to trigger hasTraceUpdates
                  {
                    key: "langfuse.session.id",
                    value: { stringValue: "new-session" },
                  }, // also triggers hasTraceUpdates
                  {
                    key: "new_span_attribute",
                    value: { stringValue: "new_value" },
                  },
                  // Note: missing original_span_attribute
                ],
              },
            ],
          },
        ],
      };

      // Validate that root span creates trace with span attributes in metadata.attributes
      const rootEvents = await convertOtelSpanToIngestionEvent(
        rootSpan,
        new Set(),
        publicKey,
      );
      const rootTrace = rootEvents.find((e) => e.type === "trace-create");
      expect(rootTrace?.body.sessionId).toBe("original-session");
      expect(
        rootTrace?.body.metadata?.attributes?.original_span_attribute,
      ).toBe("should_be_preserved");

      // Process child span with trace updates
      const childSpanEvents = await convertOtelSpanToIngestionEvent(
        childSpan,
        new Set([traceId]),
        publicKey,
      );
      const updatedTraceEvent = childSpanEvents.find(
        (e) => e.type === "trace-create",
      );

      expect(updatedTraceEvent).toBeDefined();

      // original_span_attribute should still exist
      expect(
        updatedTraceEvent.body.metadata?.attributes?.original_span_attribute,
      ).toBe("should_be_preserved");

      // new_span_attribute should now exist
      expect(
        updatedTraceEvent.body.metadata?.attributes?.new_span_attribute,
      ).toBe("new_value");

      // The sessionId should be updated
      expect(updatedTraceEvent.body.sessionId).toBe("new-session");
    });
  });

  describe("Vercel AI SDK Usage details", () => {
    it("should extract usage details from both provider metadata and 'ai.usage'", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const spanId = "1234567890abcdef";

      const vercelAIAnthropicSpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "ai", // Vercel AI SDK scope
              version: "4.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(spanId, "hex"),
                name: "bedrock-generation",
                kind: 1,
                startTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 2000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: {
                      intValue: { low: 18495, high: 0, unsigned: false },
                    },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: { low: 445, high: 0, unsigned: false } },
                  },
                  {
                    key: "ai.usage.cachedInputTokens",
                    value: { stringValue: "16399" },
                  },
                  {
                    key: "ai.response.providerMetadata",
                    value: {
                      stringValue: JSON.stringify({
                        anthropic: {
                          usage: {
                            input_tokens: 7,
                            cache_creation_input_tokens: 2089,
                            cache_read_input_tokens: 16399,
                            cache_creation: {
                              ephemeral_5m_input_tokens: 2089,
                              ephemeral_1h_input_tokens: 0,
                            },
                            output_tokens: 445,
                            service_tier: "standard",
                          },
                          cacheCreationInputTokens: 2089,
                          stopSequence: null,
                          container: null,
                          contextManagement: null,
                        },
                      }),
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        vercelAIAnthropicSpan,
        new Set(),
      );

      const observationEvent = events.find(
        (e) => e.type === "generation-create" || e.type === "span-create",
      );

      expect(observationEvent).toBeDefined();

      // Verify basic token usage
      expect(observationEvent?.body.usageDetails.input).toBe(7);
      expect(observationEvent?.body.usageDetails.output).toBe(445);

      // Verify cache tokens are extracted
      expect(observationEvent?.body.usageDetails.input_cached_tokens).toBe(
        16399,
      );
      expect(
        observationEvent?.body.usageDetails.input_cache_read,
      ).toBeUndefined(); // no double accounting
      expect(observationEvent?.body.usageDetails.input_cache_creation).toBe(
        2089,
      );
      expect(
        observationEvent?.body.usageDetails.input_cache_write,
      ).toBeUndefined(); // no double accounting
    });
    it("should extract all Bedrock cache token types from Vercel AI SDK provider metadata", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const spanId = "1234567890abcdef";

      const vercelAIBedrockSpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "ai", // Vercel AI SDK scope
              version: "4.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(spanId, "hex"),
                name: "bedrock-generation",
                kind: 1,
                startTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 2000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  // Basic usage tokens
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: {
                      intValue: { low: 5734, high: 0, unsigned: false },
                    },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: { low: 178, high: 0, unsigned: false } },
                  },
                  {
                    key: "ai.usage.tokens",
                    value: { stringValue: "10394" },
                  },
                  // Bedrock provider metadata with cache tokens
                  {
                    key: "ai.response.providerMetadata",
                    value: {
                      stringValue: JSON.stringify({
                        bedrock: {
                          usage: {
                            inputTokens: 5734,
                            outputTokens: 178,
                            totalTokens: 10394,
                            cacheReadInputTokens: 4482,
                            cacheWriteInputTokens: 0,
                            cacheCreationInputTokens: 100,
                          },
                        },
                      }),
                    },
                  },
                  // Model info
                  {
                    key: "gen_ai.request.model",
                    value: {
                      stringValue: "anthropic.claude-3-5-sonnet-20241022-v2:0",
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        vercelAIBedrockSpan,
        new Set(),
      );

      const observationEvent = events.find(
        (e) => e.type === "generation-create" || e.type === "span-create",
      );

      expect(observationEvent).toBeDefined();

      // Verify basic token usage
      expect(observationEvent?.body.usageDetails.input).toBe(1152);
      expect(observationEvent?.body.usageDetails.output).toBe(178);
      expect(observationEvent?.body.usageDetails.total).toBe(10394);

      // Verify Bedrock cache tokens are extracted
      expect(observationEvent?.body.usageDetails.input_cache_read).toBe(4482);
      expect(observationEvent?.body.usageDetails.input_cache_write).toBe(0);
      expect(observationEvent?.body.usageDetails.input_cache_creation).toBe(
        100,
      );

      // Verify model is extracted
      expect(observationEvent?.body.model).toBe(
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
      );
    });

    it("should handle Bedrock provider metadata with only cache read tokens", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const spanId = "1234567890abcdef";

      const vercelAIBedrockSpan = {
        scopeSpans: [
          {
            scope: {
              name: "ai",
              version: "4.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(spanId, "hex"),
                name: "bedrock-cached-generation",
                kind: 1,
                startTimeUnixNano: { low: 1000000, high: 406528574 },
                endTimeUnixNano: { low: 2000000, high: 406528574 },
                attributes: [
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: { low: 100, high: 0, unsigned: false } },
                  },
                  {
                    key: "ai.response.providerMetadata",
                    value: {
                      stringValue: JSON.stringify({
                        bedrock: {
                          usage: {
                            cacheReadInputTokens: 5000,
                          },
                        },
                      }),
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        vercelAIBedrockSpan,
        new Set(),
      );

      const observationEvent = events.find(
        (e) => e.type === "generation-create" || e.type === "span-create",
      );

      expect(observationEvent).toBeDefined();
      expect(observationEvent?.body.usageDetails.input).toBe(0);
      expect(observationEvent?.body.usageDetails.input_cache_read).toBe(5000);
      // Other cache tokens should not be set
      expect(
        observationEvent?.body.usageDetails.input_cache_write,
      ).toBeUndefined();
      expect(
        observationEvent?.body.usageDetails.input_cache_creation,
      ).toBeUndefined();
    });
  });

  describe("Input/Output attribute filtering from metadata", () => {
    it("should filter Langfuse SDK trace input/output attributes from trace metadata", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const rootSpanId = "1234567890abcdef";

      const rootSpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "test-scope",
              version: "1.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(rootSpanId, "hex"),
                name: "root-span",
                kind: 1,
                startTimeUnixNano: { low: 0, high: 406528574, unsigned: true },
                endTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  // Trace-level input/output (should be filtered from trace metadata.attributes)
                  {
                    key: "langfuse.trace.input",
                    value: { stringValue: '{"query": "hello"}' },
                  },
                  {
                    key: "langfuse.trace.output",
                    value: { stringValue: '{"response": "hi"}' },
                  },
                  // Custom attributes (should remain in metadata.attributes)
                  {
                    key: "custom_trace_attribute",
                    value: { stringValue: "should_be_in_metadata" },
                  },
                  {
                    key: "trace_metadata_field",
                    value: { stringValue: "preserved_value" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const rootEvents = await convertOtelSpanToIngestionEvent(
        rootSpan,
        new Set(),
      );

      const traceEvent = rootEvents.find((e) => e.type === "trace-create");

      // Verify trace input/output are extracted (as JSON strings)
      expect(traceEvent?.body.input).toEqual('{"query": "hello"}');
      expect(traceEvent?.body.output).toEqual('{"response": "hi"}');

      // Verify trace input/output keys are NOT in metadata.attributes
      expect(
        traceEvent?.body.metadata?.attributes?.["langfuse.trace.input"],
      ).toBeUndefined();
      expect(
        traceEvent?.body.metadata?.attributes?.["langfuse.trace.output"],
      ).toBeUndefined();

      // Verify custom trace attributes ARE in metadata.attributes
      expect(
        traceEvent?.body.metadata?.attributes?.custom_trace_attribute,
      ).toBe("should_be_in_metadata");
      expect(traceEvent?.body.metadata?.attributes?.trace_metadata_field).toBe(
        "preserved_value",
      );
    });

    it("should filter Vercel AI SDK input/output attributes from observation metadata", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const rootSpanId = "1234567890abcdef";
      const childSpanId = "abcdef1234567890";

      const vercelAISpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "ai", // Vercel AI SDK scope name
              version: "4.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from(childSpanId, "hex"),
                parentSpanId: Buffer.from(rootSpanId, "hex"),
                name: "vercel-ai-generation",
                kind: 1,
                startTimeUnixNano: {
                  low: 1000000,
                  high: 406528574,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 2000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  // Vercel AI SDK input/output (should be filtered)
                  {
                    key: "ai.prompt.messages",
                    value: {
                      stringValue: '[{"role":"user","content":"test"}]',
                    },
                  },
                  {
                    key: "ai.response.text",
                    value: { stringValue: "AI response text" },
                  },
                  // Custom attributes (should remain in metadata.attributes)
                  {
                    key: "custom_observation_attribute",
                    value: { stringValue: "should_remain" },
                  },
                  {
                    key: "request_id",
                    value: { stringValue: "req-123" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const vercelEvents = await convertOtelSpanToIngestionEvent(
        vercelAISpan,
        new Set([traceId]),
      );

      const vercelObservation = vercelEvents.find(
        (e) => e.type === "span-create",
      );

      // Verify Vercel AI SDK input/output are extracted
      expect(vercelObservation?.body.input).toEqual(
        JSON.stringify([{ role: "user", content: "test" }]),
      );
      expect(vercelObservation?.body.output).toBe("AI response text");

      // Verify Vercel AI SDK keys are NOT in metadata.attributes
      expect(
        vercelObservation?.body.metadata?.attributes?.["ai.prompt.messages"],
      ).toBeUndefined();
      expect(
        vercelObservation?.body.metadata?.attributes?.["ai.response.text"],
      ).toBeUndefined();

      // Verify custom observation attributes ARE in metadata.attributes
      expect(
        vercelObservation?.body.metadata?.attributes
          ?.custom_observation_attribute,
      ).toBe("should_remain");
      expect(vercelObservation?.body.metadata?.attributes?.request_id).toBe(
        "req-123",
      );
    });

    it("should filter TraceLoop and MLFlow input/output attributes from observation metadata", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";
      const rootSpanId = "1234567890abcdef";

      const traceLoopSpan = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "traceloop-scope",
              version: "1.0.0",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from("fedcba0987654321", "hex"),
                parentSpanId: Buffer.from(rootSpanId, "hex"),
                name: "traceloop-span",
                kind: 1,
                startTimeUnixNano: {
                  low: 2000000,
                  high: 406528574,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 3000000,
                  high: 406528574,
                  unsigned: true,
                },
                attributes: [
                  // TraceLoop gen_ai attributes (should be filtered)
                  {
                    key: "gen_ai.prompt.0.content",
                    value: { stringValue: "What is AI?" },
                  },
                  {
                    key: "gen_ai.completion.0.content",
                    value: { stringValue: "AI is..." },
                  },
                  // MLFlow attributes (should be filtered)
                  {
                    key: "mlflow.spanInputs",
                    value: { stringValue: '{"question": "test"}' },
                  },
                  {
                    key: "mlflow.spanOutputs",
                    value: { stringValue: '{"answer": "response"}' },
                  },
                  // Custom attributes (should remain)
                  {
                    key: "span_custom_field",
                    value: { stringValue: "custom_value" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const traceLoopEvents = await convertOtelSpanToIngestionEvent(
        traceLoopSpan,
        new Set([traceId]),
      );

      const traceLoopObservation = traceLoopEvents.find(
        (e) => e.type === "span-create",
      );

      // Verify TraceLoop input/output are extracted
      expect(traceLoopObservation?.body.input).toBeDefined();
      expect(traceLoopObservation?.body.output).toBeDefined();

      // Verify TraceLoop gen_ai keys are NOT in metadata.attributes
      expect(
        traceLoopObservation?.body.metadata?.attributes?.[
          "gen_ai.prompt.0.content"
        ],
      ).toBeUndefined();
      expect(
        traceLoopObservation?.body.metadata?.attributes?.[
          "gen_ai.completion.0.content"
        ],
      ).toBeUndefined();

      // Verify MLFlow keys are NOT in metadata.attributes
      expect(
        traceLoopObservation?.body.metadata?.attributes?.["mlflow.spanInputs"],
      ).toBeUndefined();
      expect(
        traceLoopObservation?.body.metadata?.attributes?.["mlflow.spanOutputs"],
      ).toBeUndefined();

      // Verify custom span attribute IS in metadata.attributes
      expect(
        traceLoopObservation?.body.metadata?.attributes?.span_custom_field,
      ).toBe("custom_value");
    });

    it("should extract Google ADK tool call I/O from tool_call_args/tool_response when llm_request/llm_response are empty", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";

      const googleADKToolSpan = {
        resource: {
          attributes: [
            {
              key: "telemetry.sdk.language",
              value: { stringValue: "python" },
            },
            {
              key: "telemetry.sdk.name",
              value: { stringValue: "opentelemetry" },
            },
            {
              key: "telemetry.sdk.version",
              value: { stringValue: "1.33.1" },
            },
            {
              key: "langfuse.environment",
              value: { stringValue: "production" },
            },
            {
              key: "service.name",
              value: { stringValue: "unknown_service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "openinference.instrumentation.google_adk",
              version: "0.1.6",
            },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from("89a16f45ba5e6d36", "hex"),
                parentSpanId: Buffer.from("f55a0bb51dc69634", "hex"),
                name: "execute_tool_bake_cake",
                kind: 1,
                startTimeUnixNano: {
                  low: 310920000,
                  high: 406677085,
                  unsigned: true,
                },
                endTimeUnixNano: {
                  low: 858579000,
                  high: 406677085,
                  unsigned: true,
                },
                attributes: [
                  {
                    key: "session.id",
                    value: {
                      stringValue: "test-session-333bff8e",
                    },
                  },
                  {
                    key: "user.id",
                    value: { stringValue: "test-user" },
                  },
                  {
                    key: "gen_ai.system",
                    value: { stringValue: "gcp.vertex.agent" },
                  },
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "execute_tool" },
                  },
                  {
                    key: "gen_ai.tool.name",
                    value: { stringValue: "bake_cake" },
                  },
                  {
                    key: "gen_ai.tool.description",
                    value: {
                      stringValue:
                        "a tool that bakes a cake for you, with a lot of chocolate if you ask nicely",
                    },
                  },
                  {
                    key: "gen_ai.tool.call.id",
                    value: {
                      stringValue: "adk-chocolate-caked",
                    },
                  },
                  {
                    key: "gcp.vertex.agent.tool_call_args",
                    value: {
                      stringValue: '{"query": "much duplo"}',
                    },
                  },
                  {
                    key: "gcp.vertex.agent.event_id",
                    value: {
                      stringValue: "some-id",
                    },
                  },
                  {
                    key: "gcp.vertex.agent.tool_response",
                    value: {
                      stringValue: '{"result": "particularly juicy cake"}',
                    },
                  },
                  // These are empty for tool calls in Google ADK - bug trigger
                  {
                    key: "gcp.vertex.agent.llm_request",
                    value: { stringValue: "{}" },
                  },
                  {
                    key: "gcp.vertex.agent.llm_response",
                    value: { stringValue: "{}" },
                  },
                  {
                    key: "tool.name",
                    value: { stringValue: "bake_cake" },
                  },
                  {
                    key: "tool.description",
                    value: {
                      stringValue:
                        "a tool that bakes a cake for you, with a lot of chocolate if you ask nicely",
                    },
                  },
                  {
                    key: "tool.parameters",
                    value: {
                      stringValue: '{"query": "cake type"}',
                    },
                  },
                  {
                    key: "input.value",
                    value: {
                      stringValue: '{"query": "juicy chocolate"}',
                    },
                  },
                  {
                    key: "input.mime_type",
                    value: { stringValue: "application/json" },
                  },
                  {
                    key: "output.value",
                    value: {
                      stringValue:
                        '{"id":"adk-chocolate-caked","name":"bake_cake","response":{"result":"duplo cake"}}',
                    },
                  },
                  {
                    key: "output.mime_type",
                    value: { stringValue: "application/json" },
                  },
                  {
                    key: "openinference.span.kind",
                    value: { stringValue: "TOOL" },
                  },
                ],
                events: [],
                status: { code: 1 },
              },
            ],
          },
        ],
      };

      const googleADKEvents = await convertOtelSpanToIngestionEvent(
        googleADKToolSpan,
        new Set([traceId]),
      );

      const toolObservation = googleADKEvents.find(
        (e) => e.type === "tool-create",
      );

      // Bug: input/output should NOT be "{}" from empty llm_request/llm_response
      // Instead, they should come from tool_call_args and tool_response
      expect(toolObservation?.body.input).not.toBe("{}");
      expect(toolObservation?.body.output).not.toBe("{}");

      // Verify input is correctly extracted from tool_call_args
      expect(toolObservation?.body.input).toBe('{"query": "much duplo"}');

      // Verify output is correctly extracted from tool_response
      expect(toolObservation?.body.output).toBe(
        '{"result": "particularly juicy cake"}',
      );

      // Verify Google ADK attributes are NOT in metadata.attributes
      expect(
        toolObservation?.body.metadata?.attributes?.[
          "gcp.vertex.agent.tool_call_args"
        ],
      ).toBeUndefined();
      expect(
        toolObservation?.body.metadata?.attributes?.[
          "gcp.vertex.agent.tool_response"
        ],
      ).toBeUndefined();
      expect(
        toolObservation?.body.metadata?.attributes?.[
          "gcp.vertex.agent.llm_request"
        ],
      ).toBeUndefined();
      expect(
        toolObservation?.body.metadata?.attributes?.[
          "gcp.vertex.agent.llm_response"
        ],
      ).toBeUndefined();

      // Verify trace-level attributes
      expect(toolObservation?.body.traceId).toBe(traceId);
    });

    it("should stringify non-string attributes in observation metadata", async () => {
      const traceId = "abcdef1234567890abcdef1234567890";

      const spanWithNonStringAttrs = {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "test-scope", version: "1.0.0" },
            spans: [
              {
                traceId: Buffer.from(traceId, "hex"),
                spanId: Buffer.from("1234567890abcdef", "hex"),
                name: "test-span",
                kind: 1,
                startTimeUnixNano: { low: 1000000, high: 406528574 },
                endTimeUnixNano: { low: 2000000, high: 406528574 },
                attributes: [
                  // Add input to trigger extraction logic
                  { key: "input", value: { stringValue: "test input" } },
                  // Non-string attributes that should be stringified
                  { key: "count", value: { intValue: { low: 42, high: 0 } } },
                  { key: "temperature", value: { doubleValue: 0.7 } },
                  { key: "is_streaming", value: { boolValue: true } },
                  // String attribute should remain as-is
                  {
                    key: "custom_field",
                    value: { stringValue: "custom-value" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const events = await convertOtelSpanToIngestionEvent(
        spanWithNonStringAttrs,
        new Set([traceId]),
      );

      const observation = events.find((e) => e.type === "span-create");

      // Verify input is extracted
      expect(observation?.body.input).toBe("test input");

      // Verify non-string values are stringified in metadata.attributes
      expect(observation?.body.metadata?.attributes?.count).toBe("42");
      expect(observation?.body.metadata?.attributes?.temperature).toBe("0.7");
      expect(observation?.body.metadata?.attributes?.is_streaming).toBe("true");
      // Verify string values remain strings
      expect(observation?.body.metadata?.attributes?.custom_field).toBe(
        "custom-value",
      );
    });
  });
});
