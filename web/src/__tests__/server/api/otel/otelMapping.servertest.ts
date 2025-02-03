import { convertOtelSpanToIngestionEvent } from "@/src/features/otel/server";
import { ingestionEvent } from "@langfuse/shared/src/server";

describe("OTel Resource Span Mapping", () => {
  describe("Vendor Spans", () => {
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
      const langfuseEvents = convertOtelSpanToIngestionEvent(resourceSpan);

      // Then
      // Will throw an error if the parsing fails
      const parsedEvents = langfuseEvents.map((event) =>
        ingestionEvent.parse(event),
      );
      expect(parsedEvents).toHaveLength(2);
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

    it.each([
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
    ])(
      "Attributes: %s",
      (
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
        const langfuseEvents = convertOtelSpanToIngestionEvent(resourceSpan);

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
    ])(
      "ResourceAttributes: %s",
      (
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
        const langfuseEvents = convertOtelSpanToIngestionEvent(resourceSpan);

        // Then
        const entity: { body: Record<string, any> } =
          spec.entity === "trace" ? langfuseEvents[0] : langfuseEvents[1];
        expect(entity.body[spec.entityAttributeKey]).toEqual(
          spec.entityAttributeValue,
        );
      },
    );
  });
});
