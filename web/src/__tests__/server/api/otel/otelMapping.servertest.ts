import { OtelIngestionProcessor } from "@/src/features/otel/server/OtelIngestionProcessor";
import { createIngestionEventSchema } from "@langfuse/shared/src/server";

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
        name: undefined,
        environment: "production",
      });
    });
    it("should throw an error if langfuse scope spans have wrong project ID", async () => {
      const langfuseOtelSpans = [
        {
          resource: {
            attributes: [
              {
                key: "telemetry.sdk.language",
                value: {
                  stringValue: "python",
                },
              },
              {
                key: "telemetry.sdk.name",
                value: {
                  stringValue: "opentelemetry",
                },
              },
              {
                key: "telemetry.sdk.version",
                value: {
                  stringValue: "1.32.0",
                },
              },
              {
                key: "service.name",
                value: {
                  stringValue: "unknown_service",
                },
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
                    value: {
                      stringValue: "pk-lf-another",
                    },
                  },
                ],
              },
              spans: [
                {
                  traceId: {
                    type: "Buffer",
                    data: [
                      219, 242, 249, 255, 154, 168, 21, 165, 233, 52, 222, 186,
                      28, 97, 54, 95,
                    ],
                  },
                  spanId: {
                    type: "Buffer",
                    data: [128, 191, 93, 22, 69, 180, 81, 135],
                  },
                  name: "t1",
                  kind: 1,
                  startTimeUnixNano: {
                    low: -1422874264,
                    high: 406650983,
                    unsigned: true,
                  },
                  endTimeUnixNano: {
                    low: -904695264,
                    high: 406650983,
                    unsigned: true,
                  },
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: {
                        stringValue: "span",
                      },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        },
      ];

      await expect(
        Promise.all(
          langfuseOtelSpans.map(
            async (span) =>
              await convertOtelSpanToIngestionEvent(span, new Set(), publicKey),
          ),
        ),
      ).rejects.toThrowError("Langfuse OTEL SDK span has different public key");
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

    it("should interpret openinference LLM calls as a generation", async () => {
      const resourceSpan = {
        scopeSpans: [
          {
            spans: [
              {
                ...defaultSpanProps,
                attributes: [
                  {
                    key: "openinference.span.kind",
                    value: { stringValue: "LLM" },
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
      // Check that we create a generation
      expect(
        langfuseEvents.some((event) => event.type === "generation-create"),
      ).toBe(true);
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
        const resourceSpan = {
          scopeSpans: [
            {
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
  });
});
