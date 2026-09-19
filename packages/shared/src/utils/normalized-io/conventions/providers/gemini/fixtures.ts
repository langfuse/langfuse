import type { NormalizedIOFixture } from "../fixture-types";

// Docs-derived GenerateContent history, not the separate Interactions API.
// https://ai.google.dev/gemini-api/docs/function-calling
export const documentedFunctionRoundTripFixtures: NormalizedIOFixture[] = [
  false,
  true,
].map(
  (python): NormalizedIOFixture => ({
    name: `Gemini ${python ? "Python" : "REST"} function round trip with system instruction`,
    spanIO: {
      input: {
        ...(python
          ? {
              config: {
                system_instruction: { parts: [{ text: "Be concise." }] },
              },
            }
          : { systemInstruction: { parts: [{ text: "Be concise." }] } }),
        contents: [
          { role: "user", parts: [{ text: "Weather in Paris?" }] },
          {
            role: "model",
            parts: [
              {
                [python ? "function_call" : "functionCall"]: {
                  id: "call_weather",
                  name: "get_weather",
                  args: { city: "Paris" },
                },
              },
            ],
          },
          {
            role: "user",
            parts: [
              {
                [python ? "function_response" : "functionResponse"]: {
                  id: "call_weather",
                  name: "get_weather",
                  response: { temperature: 15 },
                },
              },
            ],
          },
        ],
      },
      output: {
        candidates: [
          { content: { role: "model", parts: [{ text: "15 degrees." }] } },
        ],
      },
      metadata: undefined,
    },
    expected: {
      messages: [
        {
          source: "input",
          role: "system",
          parts: [{ type: "text", text: "Be concise." }],
        },
        {
          source: "input",
          role: "user",
          parts: [{ type: "text", text: "Weather in Paris?" }],
        },
        {
          source: "input",
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call_weather",
              toolName: "get_weather",
              input: { city: "Paris" },
              toolType: "functionCall",
            },
          ],
        },
        {
          source: "input",
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "call_weather",
              output: { temperature: 15 },
            },
          ],
        },
        {
          source: "output",
          role: "assistant",
          parts: [{ type: "text", text: "15 degrees." }],
        },
      ],
      toolDefinitions: [],
    },
  }),
);

/** Synthetic Gemini case adapted from the playground suite. */
export const geminiEmbeddedToolDefinitionFixture = {
  name: "extracts Gemini tool-definition messages",
  spanIO: {
    input: [
      { role: "system", content: "Use tools when they are helpful." },
      {
        role: "model",
        content: [{ type: "text", text: "How can I help?" }],
      },
      {
        role: "tool",
        content: {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the current weather in a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
      },
      { role: "user", content: "What can you do?" },
    ],
    output: undefined,
    metadata: { provider: "google_vertexai" },
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "Use tools when they are helpful." }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "How can I help?" }],
        source: "input",
      },
      {
        role: "user",
        parts: [{ type: "text", text: "What can you do?" }],
        source: "input",
      },
    ],
    toolDefinitions: [
      {
        name: "get_weather",
        description: "Get the current weather in a city",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        type: "function",
      },
    ],
  },
} satisfies NormalizedIOFixture;

/** Gemini system instructions can sit beside a generic message carrier. */
export const geminiSystemInstructionWithGenericMessagesFixture = {
  name: "keeps a Gemini system instruction beside generic messages",
  spanIO: {
    input: {
      messages: [{ role: "user", content: "Help me plan a trip." }],
      config: {
        system_instruction: {
          parts: [{ text: "Keep the answer concise." }],
        },
      },
    },
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "Keep the answer concise." }],
        source: "input",
      },
      {
        role: "user",
        parts: [{ type: "text", text: "Help me plan a trip." }],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

/**
 * Raw Gemini/Vertex wire shapes: keyed parts without a `type` discriminator
 * (bare text, inline_data, file_data), thought parts with thoughtSignature,
 * provider-executed code execution (executable_code / code_execution_result),
 * and the candidate-level finishReason. generateContent can attach a
 * thoughtSignature to any part, including the final answer text, so only the
 * `thought` flag marks reasoning.
 */
export const geminiMediaAndCodeExecutionFixture = {
  name: "normalizes Gemini media parts and code execution",
  spanIO: {
    input: {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyze this chart and compute the sum." },
            { inline_data: { mime_type: "image/png", data: "aVZCT1J3" } },
            {
              file_data: {
                mime_type: "application/pdf",
                file_uri: "gs://bucket/report.pdf",
              },
            },
          ],
        },
      ],
    },
    output: {
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: "Let me run the numbers.",
                thought: true,
                thoughtSignature: "sig_gemini_1",
              },
              {
                executable_code: { language: "PYTHON", code: "print(1 + 2)" },
              },
              {
                code_execution_result: { outcome: "OUTCOME_OK", output: "3" },
              },
              { text: "The sum is 3.", thoughtSignature: "sig_gemini_2" },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [
          { type: "text", text: "Analyze this chart and compute the sum." },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "base64", data: "aVZCT1J3" },
          },
          {
            type: "file",
            mediaType: "application/pdf",
            content: { kind: "url", url: "gs://bucket/report.pdf" },
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "Let me run the numbers.",
              signature: "sig_gemini_1",
            },
          },
          {
            type: "tool-call",
            toolCallId: null,
            toolName: "code_execution",
            input: { language: "PYTHON", code: "print(1 + 2)" },
            toolType: "executable_code",
            providerExecuted: true,
          },
          {
            type: "tool-result",
            toolCallId: null,
            toolName: "code_execution",
            output: { outcome: "OUTCOME_OK", output: "3" },
          },
          { type: "text", text: "The sum is 3." },
        ],
        finishReason: { type: "stop", raw: "STOP" },
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

// Verbatim stored observation IO from ChatML integration-example exports.
export const capturedTraceFixtures: NormalizedIOFixture[] = [
  // Source: worker/src/__tests__/chatml/framework-traces/google-adk-2025-08-28.trace.json; observation bded677884f031ce
  {
    name: "verbatim google-adk-2025-08-28.trace.json / bded677884f031ce",
    spanIO: {
      input:
        '{"model": "gemini-2.0-flash", "config": {"http_options": {"headers": {"x-goog-api-client": "google-adk/1.12.0 gl-python/3.12.11", "user-agent": "google-adk/1.12.0 gl-python/3.12.11"}}, "system_instruction": "Always greet using the say_hello tool.\\n\\nYou are an agent. Your internal name is \\"hello_agent\\".", "tools": [{"function_declarations": [{"name": "say_hello"}]}]}, "contents": [{"parts": [{"text": "hi"}], "role": "user"}, {"parts": [{"function_call": {"args": {}, "name": "say_hello"}}], "role": "model"}, {"parts": [{"function_response": {"name": "say_hello", "response": {"greeting": "Hello Langfuse 👋"}}}], "role": "user"}]}',
      output:
        '{"content":{"parts":[{"text":"Hello Langfuse 👋!\\n"}],"role":"model"},"finish_reason":"STOP","usage_metadata":{"candidates_token_count":6,"candidates_tokens_details":[{"modality":"TEXT","token_count":6}],"prompt_token_count":39,"prompt_tokens_details":[{"modality":"TEXT","token_count":39}],"total_token_count":45}}',
      metadata:
        '{"attributes":{"session.id":"demo-session","user.id":"demo-user","gen_ai.system":"gcp.vertex.agent","gen_ai.request.model":"gemini-2.0-flash","gcp.vertex.agent.invocation_id":"e-5022fa36-69c5-4fe7-bb37-662704dcb713","gcp.vertex.agent.session_id":"demo-session","gcp.vertex.agent.event_id":"f2596747-d905-44bc-b85c-1e9692c3249c","gcp.vertex.agent.llm_request":"{\\"model\\": \\"gemini-2.0-flash\\", \\"config\\": {\\"http_options\\": {\\"headers\\": {\\"x-goog-api-client\\": \\"google-adk/1.12.0 gl-python/3.12.11\\", \\"user-agent\\": \\"google-adk/1.12.0 gl-python/3.12.11\\"}}, \\"system_instruction\\": \\"Always greet using the say_hello tool.\\\\n\\\\nYou are an agent. Your internal name is \\\\\\"hello_agent\\\\\\".\\", \\"tools\\": [{\\"function_declarations\\": [{\\"name\\": \\"say_hello\\"}]}]}, \\"contents\\": [{\\"parts\\": [{\\"text\\": \\"hi\\"}], \\"role\\": \\"user\\"}, {\\"parts\\": [{\\"function_call\\": {\\"args\\": {}, \\"name\\": \\"say_hello\\"}}], \\"role\\": \\"model\\"}, {\\"parts\\": [{\\"function_response\\": {\\"name\\": \\"say_hello\\", \\"response\\": {\\"greeting\\": \\"Hello Langfuse 👋\\"}}}], \\"role\\": \\"user\\"}]}","gcp.vertex.agent.llm_response":"{\\"content\\":{\\"parts\\":[{\\"text\\":\\"Hello Langfuse 👋!\\\\n\\"}],\\"role\\":\\"model\\"},\\"finish_reason\\":\\"STOP\\",\\"usage_metadata\\":{\\"candidates_token_count\\":6,\\"candidates_tokens_details\\":[{\\"modality\\":\\"TEXT\\",\\"token_count\\":6}],\\"prompt_token_count\\":39,\\"prompt_tokens_details\\":[{\\"modality\\":\\"TEXT\\",\\"token_count\\":39}],\\"total_token_count\\":45}}","gen_ai.usage.input_tokens":"39","gen_ai.usage.output_tokens":"6","gen_ai.response.finish_reasons":"[\\"stop\\"]","llm.provider":"google","input.value":"{\\"model\\": \\"gemini-2.0-flash\\", \\"config\\": {\\"http_options\\": {\\"headers\\": {\\"x-goog-api-client\\": \\"google-adk/1.12.0 gl-python/3.12.11\\", \\"user-agent\\": \\"google-adk/1.12.0 gl-python/3.12.11\\"}}, \\"system_instruction\\": \\"Always greet using the say_hello tool.\\\\n\\\\nYou are an agent. Your internal name is \\\\\\"hello_agent\\\\\\".\\", \\"tools\\": [{\\"function_declarations\\": [{\\"name\\": \\"say_hello\\"}]}]}, \\"contents\\": [{\\"parts\\": [{\\"text\\": \\"hi\\"}], \\"role\\": \\"user\\"}, {\\"parts\\": [{\\"function_call\\": {\\"args\\": {}, \\"name\\": \\"say_hello\\"}}], \\"role\\": \\"model\\"}, {\\"parts\\": [{\\"function_response\\": {\\"name\\": \\"say_hello\\", \\"response\\": {\\"greeting\\": \\"Hello Langfuse 👋\\"}}}], \\"role\\": \\"user\\"}]}","input.mime_type":"application/json","llm.tools.0.tool.json_schema":"{\\"name\\":\\"say_hello\\"}","llm.model_name":"gemini-2.0-flash","llm.invocation_parameters":"{\\"http_options\\":{\\"headers\\":{\\"x-goog-api-client\\":\\"google-adk/1.12.0 gl-python/3.12.11\\",\\"user-agent\\":\\"google-adk/1.12.0 gl-python/3.12.11\\"}},\\"system_instruction\\":\\"Always greet using the say_hello tool.\\\\n\\\\nYou are an agent. Your internal name is \\\\\\"hello_agent\\\\\\".\\",\\"tools\\":[{\\"function_declarations\\":[{\\"name\\":\\"say_hello\\"}]}]}","llm.input_messages.0.message.role":"system","llm.input_messages.0.message.content":"Always greet using the say_hello tool.\\n\\nYou are an agent. Your internal name is \\"hello_agent\\".","llm.input_messages.1.message.role":"user","llm.input_messages.1.message.contents.0.message_content.text":"hi","llm.input_messages.1.message.contents.0.message_content.type":"text","llm.input_messages.2.message.role":"model","llm.input_messages.2.message.tool_calls.0.tool_call.function.name":"say_hello","llm.input_messages.3.message.role":"tool","llm.input_messages.3.message.name":"say_hello","llm.input_messages.3.message.content":"{\\"greeting\\": \\"Hello Langfuse 👋\\"}","output.value":"{\\"content\\":{\\"parts\\":[{\\"text\\":\\"Hello Langfuse 👋!\\\\n\\"}],\\"role\\":\\"model\\"},\\"finish_reason\\":\\"STOP\\",\\"usage_metadata\\":{\\"candidates_token_count\\":6,\\"candidates_tokens_details\\":[{\\"modality\\":\\"TEXT\\",\\"token_count\\":6}],\\"prompt_token_count\\":39,\\"prompt_tokens_details\\":[{\\"modality\\":\\"TEXT\\",\\"token_count\\":39}],\\"total_token_count\\":45}}","output.mime_type":"application/json","llm.token_count.total":"45","llm.token_count.prompt":"39","llm.token_count.completion":"6","llm.output_messages.0.message.role":"model","llm.output_messages.0.message.contents.0.message_content.text":"Hello Langfuse 👋!\\n","llm.output_messages.0.message.contents.0.message_content.type":"text","openinference.span.kind":"LLM"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.36.0","service.name":"unknown_service"},"scope":{"name":"openinference.instrumentation.google_adk","version":"0.1.3","attributes":{}}}',
    },
    expected: {
      messages: [
        {
          role: "system",
          parts: [
            {
              type: "text",
              text: 'Always greet using the say_hello tool.\n\nYou are an agent. Your internal name is "hello_agent".',
            },
          ],
          source: "input",
        },
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "hi",
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool-call",
              toolCallId: null,
              toolName: "say_hello",
              input: {},
              toolType: "functionCall",
            },
          ],
          source: "input",
        },
        {
          role: "tool",
          parts: [
            {
              type: "tool-result",
              toolCallId: "say_hello",
              output: {
                greeting: "Hello Langfuse 👋",
              },
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Hello Langfuse 👋!\n",
            },
          ],
          finishReason: {
            type: "stop",
            raw: "STOP",
          },
          source: "output",
        },
      ],
      toolDefinitions: [
        {
          name: "say_hello",
        },
      ],
    },
  },
  // Source: worker/src/__tests__/chatml/framework-traces/google-gemini-2025-08-01.trace.json; observation b7a63ca7e1d083bc
  {
    name: "verbatim google-gemini-2025-08-01.trace.json / b7a63ca7e1d083bc",
    spanIO: {
      input: '{"model": "gemini-2.5-flash", "contents": "What is Langfuse?"}',
      output:
        '{"sdk_http_response":{"headers":{"content-type":"application/json; charset=UTF-8","vary":"Origin, X-Origin, Referer","content-encoding":"gzip","date":"Fri, 01 Aug 2025 13:22:12 GMT","server":"scaffolding on HTTPServer2","x-xss-protection":"0","x-frame-options":"SAMEORIGIN","x-content-type-options":"nosniff","server-timing":"gfet4t7; dur=11935","alt-svc":"h3=\\":443\\"; ma=2592000,h3-29=\\":443\\"; ma=2592000","transfer-encoding":"chunked"}},"candidates":[{"content":{"parts":[{"text":"**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\\n\\nIn essence, it acts as a \\"flight recorder\\" or \\"black box\\" for your AI applications, giving you deep insights into how they are performing in real-time and helping you iterate and improve them.\\n\\nHere\'s a breakdown of what Langfuse is and why it\'s important:\\n\\n### The Problem Langfuse Solves\\n\\nBuilding applications powered by LLMs (like chatbots, summarizers, RAG systems) presents unique challenges:\\n\\n1.  **Non-Determinism:** LLMs aren\'t like traditional code; their outputs can vary, making debugging difficult.\\n2.  **Opacity:** It\'s hard to see what\'s happening \\"inside\\" the LLM call – what prompt was sent, what response was received, how long it took, and what tools were used.\\n3.  **Performance & Cost Tracking:** Monitoring token usage, latency, and costs across various LLM calls and chains is complex.\\n4.  **Evaluation & Improvement:** How do you know if a change to your prompt or RAG system actually made your application better? How do you collect user feedback?\\n5.  **Debugging Production Issues:** When something goes wrong in production, tracing the exact cause (e.g., a bad prompt, a hallucination, a failed tool call) is crucial.\\n\\n### How Langfuse Works & Its Key Features\\n\\nLangfuse addresses these challenges by providing:\\n\\n1.  **Tracing & Observability:**\\n    *   **End-to-end visibility:** It captures every step of an LLM application\'s lifecycle, from user input, through various LLM calls, tool usage, RAG retrievals, and final output.\\n    *   **Detailed Spans:** Each step (e.g., an OpenAI call, a LlamaIndex query, a custom function) is recorded as a \\"span,\\" showing inputs, outputs, timestamps, costs (tokens, price), and associated metadata.\\n    *   **Visualizations:** Presents these traces in a clear, waterfall-style UI, making it easy to understand the flow and identify bottlenecks or errors.\\n\\n2.  **Debugging & Monitoring:**\\n    *   **Real-time Dashboards:** Provides metrics on latency, cost, token usage, and error rates across your application.\\n    *   **Error Identification:** Quickly pinpoint exactly which LLM call or step failed within a complex chain.\\n    *   **Search & Filtering:** Easily find specific traces based on user IDs, session IDs, error status, or custom tags.\\n\\n3.  **Evaluation & Feedback Loops:**\\n    *   **Manual Feedback:** Allows users (or developers) to provide direct feedback (e.g., \\"good,\\" \\"bad,\\" custom scores) on specific traces. This is invaluable for human-in-the-loop evaluation.\\n    *   **Automated Evaluation:** Integrates with evaluation frameworks (e.g., RAGAS) or custom scripts to automatically score LLM outputs, enabling A/B testing of prompts or models.\\n    *   **Prompt Comparison:** Helps you compare the performance of different prompt versions side-by-side based on collected metrics and evaluations.\\n\\n4.  **Prompt Management:**\\n    *   Store and version control your prompts.\\n    *   Attach evaluations to specific prompt versions to track their effectiveness over time.\\n\\n5.  **User & Session Tracking:**\\n    *   Associate traces with specific users or sessions, allowing you to understand individual user journeys and identify patterns.\\n\\n### Key Benefits\\n\\n*   **Faster Debugging:** Quickly diagnose and fix issues in your LLM applications.\\n*   **Improved Performance:** Identify and optimize slow or costly parts of your LLM chains.\\n*   **Data-Driven Iteration:** Make informed decisions about prompt engineering, model selection, and architecture based on real usage data and evaluations.\\n*   **Cost Control:** Monitor token usage and costs to prevent budget overruns.\\n*   **Enhanced Reliability:** Build more robust and production-ready LLM applications.\\n\\n### Integrations\\n\\nLangfuse integrates with popular LLM frameworks and libraries, including:\\n\\n*   LangChain\\n*   LlamaIndex\\n*   OpenAI API\\n*   Anthropic API\\n*   And can be used with any custom LLM integration.\\n\\nIn summary, Langfuse is a critical tool for any developer or team serious about building, deploying, and maintaining high-quality, performant, and reliable LLM-powered applications in production."}],"role":"model"},"finish_reason":"STOP","index":0}],"model_version":"gemini-2.5-flash","usage_metadata":{"candidates_token_count":951,"prompt_token_count":6,"prompt_tokens_details":[{"modality":"TEXT","token_count":6}],"thoughts_token_count":1104,"total_token_count":2061},"automatic_function_calling_history":[]}',
      metadata:
        '{"attributes":{"llm.input_messages.0.message.content":"What is Langfuse?","llm.input_messages.0.message.role":"user","output.value":"{\\"sdk_http_response\\":{\\"headers\\":{\\"content-type\\":\\"application/json; charset=UTF-8\\",\\"vary\\":\\"Origin, X-Origin, Referer\\",\\"content-encoding\\":\\"gzip\\",\\"date\\":\\"Fri, 01 Aug 2025 13:22:12 GMT\\",\\"server\\":\\"scaffolding on HTTPServer2\\",\\"x-xss-protection\\":\\"0\\",\\"x-frame-options\\":\\"SAMEORIGIN\\",\\"x-content-type-options\\":\\"nosniff\\",\\"server-timing\\":\\"gfet4t7; dur=11935\\",\\"alt-svc\\":\\"h3=\\\\\\":443\\\\\\"; ma=2592000,h3-29=\\\\\\":443\\\\\\"; ma=2592000\\",\\"transfer-encoding\\":\\"chunked\\"}},\\"candidates\\":[{\\"content\\":{\\"parts\\":[{\\"text\\":\\"**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\\\\n\\\\nIn essence, it acts as a \\\\\\"flight recorder\\\\\\" or \\\\\\"black box\\\\\\" for your AI applications, giving you deep insights into how they are performing in real-time and helping you iterate and improve them.\\\\n\\\\nHere\'s a breakdown of what Langfuse is and why it\'s important:\\\\n\\\\n### The Problem Langfuse Solves\\\\n\\\\nBuilding applications powered by LLMs (like chatbots, summarizers, RAG systems) presents unique challenges:\\\\n\\\\n1.  **Non-Determinism:** LLMs aren\'t like traditional code; their outputs can vary, making debugging difficult.\\\\n2.  **Opacity:** It\'s hard to see what\'s happening \\\\\\"inside\\\\\\" the LLM call – what prompt was sent, what response was received, how long it took, and what tools were used.\\\\n3.  **Performance & Cost Tracking:** Monitoring token usage, latency, and costs across various LLM calls and chains is complex.\\\\n4.  **Evaluation & Improvement:** How do you know if a change to your prompt or RAG system actually made your application better? How do you collect user feedback?\\\\n5.  **Debugging Production Issues:** When something goes wrong in production, tracing the exact cause (e.g., a bad prompt, a hallucination, a failed tool call) is crucial.\\\\n\\\\n### How Langfuse Works & Its Key Features\\\\n\\\\nLangfuse addresses these challenges by providing:\\\\n\\\\n1.  **Tracing & Observability:**\\\\n    *   **End-to-end visibility:** It captures every step of an LLM application\'s lifecycle, from user input, through various LLM calls, tool usage, RAG retrievals, and final output.\\\\n    *   **Detailed Spans:** Each step (e.g., an OpenAI call, a LlamaIndex query, a custom function) is recorded as a \\\\\\"span,\\\\\\" showing inputs, outputs, timestamps, costs (tokens, price), and associated metadata.\\\\n    *   **Visualizations:** Presents these traces in a clear, waterfall-style UI, making it easy to understand the flow and identify bottlenecks or errors.\\\\n\\\\n2.  **Debugging & Monitoring:**\\\\n    *   **Real-time Dashboards:** Provides metrics on latency, cost, token usage, and error rates across your application.\\\\n    *   **Error Identification:** Quickly pinpoint exactly which LLM call or step failed within a complex chain.\\\\n    *   **Search & Filtering:** Easily find specific traces based on user IDs, session IDs, error status, or custom tags.\\\\n\\\\n3.  **Evaluation & Feedback Loops:**\\\\n    *   **Manual Feedback:** Allows users (or developers) to provide direct feedback (e.g., \\\\\\"good,\\\\\\" \\\\\\"bad,\\\\\\" custom scores) on specific traces. This is invaluable for human-in-the-loop evaluation.\\\\n    *   **Automated Evaluation:** Integrates with evaluation frameworks (e.g., RAGAS) or custom scripts to automatically score LLM outputs, enabling A/B testing of prompts or models.\\\\n    *   **Prompt Comparison:** Helps you compare the performance of different prompt versions side-by-side based on collected metrics and evaluations.\\\\n\\\\n4.  **Prompt Management:**\\\\n    *   Store and version control your prompts.\\\\n    *   Attach evaluations to specific prompt versions to track their effectiveness over time.\\\\n\\\\n5.  **User & Session Tracking:**\\\\n    *   Associate traces with specific users or sessions, allowing you to understand individual user journeys and identify patterns.\\\\n\\\\n### Key Benefits\\\\n\\\\n*   **Faster Debugging:** Quickly diagnose and fix issues in your LLM applications.\\\\n*   **Improved Performance:** Identify and optimize slow or costly parts of your LLM chains.\\\\n*   **Data-Driven Iteration:** Make informed decisions about prompt engineering, model selection, and architecture based on real usage data and evaluations.\\\\n*   **Cost Control:** Monitor token usage and costs to prevent budget overruns.\\\\n*   **Enhanced Reliability:** Build more robust and production-ready LLM applications.\\\\n\\\\n### Integrations\\\\n\\\\nLangfuse integrates with popular LLM frameworks and libraries, including:\\\\n\\\\n*   LangChain\\\\n*   LlamaIndex\\\\n*   OpenAI API\\\\n*   Anthropic API\\\\n*   And can be used with any custom LLM integration.\\\\n\\\\nIn summary, Langfuse is a critical tool for any developer or team serious about building, deploying, and maintaining high-quality, performant, and reliable LLM-powered applications in production.\\"}],\\"role\\":\\"model\\"},\\"finish_reason\\":\\"STOP\\",\\"index\\":0}],\\"model_version\\":\\"gemini-2.5-flash\\",\\"usage_metadata\\":{\\"candidates_token_count\\":951,\\"prompt_token_count\\":6,\\"prompt_tokens_details\\":[{\\"modality\\":\\"TEXT\\",\\"token_count\\":6}],\\"thoughts_token_count\\":1104,\\"total_token_count\\":2061},\\"automatic_function_calling_history\\":[]}","output.mime_type":"application/json","llm.provider":"google","input.value":"{\\"model\\": \\"gemini-2.5-flash\\", \\"contents\\": \\"What is Langfuse?\\"}","input.mime_type":"application/json","llm.model_name":"gemini-2.5-flash","llm.token_count.total":"2061","llm.token_count.prompt":"6","llm.token_count.completion_details.reasoning":"1104","llm.token_count.completion":"2055","llm.output_messages.0.message.content":"**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\\n\\nIn essence, it acts as a \\"flight recorder\\" or \\"black box\\" for your AI applications, giving you deep insights into how they are performing in real-time and helping you iterate and improve them.\\n\\nHere\'s a breakdown of what Langfuse is and why it\'s important:\\n\\n### The Problem Langfuse Solves\\n\\nBuilding applications powered by LLMs (like chatbots, summarizers, RAG systems) presents unique challenges:\\n\\n1.  **Non-Determinism:** LLMs aren\'t like traditional code; their outputs can vary, making debugging difficult.\\n2.  **Opacity:** It\'s hard to see what\'s happening \\"inside\\" the LLM call – what prompt was sent, what response was received, how long it took, and what tools were used.\\n3.  **Performance & Cost Tracking:** Monitoring token usage, latency, and costs across various LLM calls and chains is complex.\\n4.  **Evaluation & Improvement:** How do you know if a change to your prompt or RAG system actually made your application better? How do you collect user feedback?\\n5.  **Debugging Production Issues:** When something goes wrong in production, tracing the exact cause (e.g., a bad prompt, a hallucination, a failed tool call) is crucial.\\n\\n### How Langfuse Works & Its Key Features\\n\\nLangfuse addresses these challenges by providing:\\n\\n1.  **Tracing & Observability:**\\n    *   **End-to-end visibility:** It captures every step of an LLM application\'s lifecycle, from user input, through various LLM calls, tool usage, RAG retrievals, and final output.\\n    *   **Detailed Spans:** Each step (e.g., an OpenAI call, a LlamaIndex query, a custom function) is recorded as a \\"span,\\" showing inputs, outputs, timestamps, costs (tokens, price), and associated metadata.\\n    *   **Visualizations:** Presents these traces in a clear, waterfall-style UI, making it easy to understand the flow and identify bottlenecks or errors.\\n\\n2.  **Debugging & Monitoring:**\\n    *   **Real-time Dashboards:** Provides metrics on latency, cost, token usage, and error rates across your application.\\n    *   **Error Identification:** Quickly pinpoint exactly which LLM call or step failed within a complex chain.\\n    *   **Search & Filtering:** Easily find specific traces based on user IDs, session IDs, error status, or custom tags.\\n\\n3.  **Evaluation & Feedback Loops:**\\n    *   **Manual Feedback:** Allows users (or developers) to provide direct feedback (e.g., \\"good,\\" \\"bad,\\" custom scores) on specific traces. This is invaluable for human-in-the-loop evaluation.\\n    *   **Automated Evaluation:** Integrates with evaluation frameworks (e.g., RAGAS) or custom scripts to automatically score LLM outputs, enabling A/B testing of prompts or models.\\n    *   **Prompt Comparison:** Helps you compare the performance of different prompt versions side-by-side based on collected metrics and evaluations.\\n\\n4.  **Prompt Management:**\\n    *   Store and version control your prompts.\\n    *   Attach evaluations to specific prompt versions to track their effectiveness over time.\\n\\n5.  **User & Session Tracking:**\\n    *   Associate traces with specific users or sessions, allowing you to understand individual user journeys and identify patterns.\\n\\n### Key Benefits\\n\\n*   **Faster Debugging:** Quickly diagnose and fix issues in your LLM applications.\\n*   **Improved Performance:** Identify and optimize slow or costly parts of your LLM chains.\\n*   **Data-Driven Iteration:** Make informed decisions about prompt engineering, model selection, and architecture based on real usage data and evaluations.\\n*   **Cost Control:** Monitor token usage and costs to prevent budget overruns.\\n*   **Enhanced Reliability:** Build more robust and production-ready LLM applications.\\n\\n### Integrations\\n\\nLangfuse integrates with popular LLM frameworks and libraries, including:\\n\\n*   LangChain\\n*   LlamaIndex\\n*   OpenAI API\\n*   Anthropic API\\n*   And can be used with any custom LLM integration.\\n\\nIn summary, Langfuse is a critical tool for any developer or team serious about building, deploying, and maintaining high-quality, performant, and reliable LLM-powered applications in production.","llm.output_messages.0.message.role":"model","openinference.span.kind":"LLM"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.34.1","service.name":"unknown_service"},"scope":{"name":"openinference.instrumentation.google_genai","version":"0.1.5","attributes":{}}}',
    },
    expected: {
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "What is Langfuse?",
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              text: '**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\n\nIn essence, it acts as a "flight recorder" or "black box" for your AI applications, giving you deep insights into how they are performing in real-time and helping you iterate and improve them.\n\nHere\'s a breakdown of what Langfuse is and why it\'s important:\n\n### The Problem Langfuse Solves\n\nBuilding applications powered by LLMs (like chatbots, summarizers, RAG systems) presents unique challenges:\n\n1.  **Non-Determinism:** LLMs aren\'t like traditional code; their outputs can vary, making debugging difficult.\n2.  **Opacity:** It\'s hard to see what\'s happening "inside" the LLM call – what prompt was sent, what response was received, how long it took, and what tools were used.\n3.  **Performance & Cost Tracking:** Monitoring token usage, latency, and costs across various LLM calls and chains is complex.\n4.  **Evaluation & Improvement:** How do you know if a change to your prompt or RAG system actually made your application better? How do you collect user feedback?\n5.  **Debugging Production Issues:** When something goes wrong in production, tracing the exact cause (e.g., a bad prompt, a hallucination, a failed tool call) is crucial.\n\n### How Langfuse Works & Its Key Features\n\nLangfuse addresses these challenges by providing:\n\n1.  **Tracing & Observability:**\n    *   **End-to-end visibility:** It captures every step of an LLM application\'s lifecycle, from user input, through various LLM calls, tool usage, RAG retrievals, and final output.\n    *   **Detailed Spans:** Each step (e.g., an OpenAI call, a LlamaIndex query, a custom function) is recorded as a "span," showing inputs, outputs, timestamps, costs (tokens, price), and associated metadata.\n    *   **Visualizations:** Presents these traces in a clear, waterfall-style UI, making it easy to understand the flow and identify bottlenecks or errors.\n\n2.  **Debugging & Monitoring:**\n    *   **Real-time Dashboards:** Provides metrics on latency, cost, token usage, and error rates across your application.\n    *   **Error Identification:** Quickly pinpoint exactly which LLM call or step failed within a complex chain.\n    *   **Search & Filtering:** Easily find specific traces based on user IDs, session IDs, error status, or custom tags.\n\n3.  **Evaluation & Feedback Loops:**\n    *   **Manual Feedback:** Allows users (or developers) to provide direct feedback (e.g., "good," "bad," custom scores) on specific traces. This is invaluable for human-in-the-loop evaluation.\n    *   **Automated Evaluation:** Integrates with evaluation frameworks (e.g., RAGAS) or custom scripts to automatically score LLM outputs, enabling A/B testing of prompts or models.\n    *   **Prompt Comparison:** Helps you compare the performance of different prompt versions side-by-side based on collected metrics and evaluations.\n\n4.  **Prompt Management:**\n    *   Store and version control your prompts.\n    *   Attach evaluations to specific prompt versions to track their effectiveness over time.\n\n5.  **User & Session Tracking:**\n    *   Associate traces with specific users or sessions, allowing you to understand individual user journeys and identify patterns.\n\n### Key Benefits\n\n*   **Faster Debugging:** Quickly diagnose and fix issues in your LLM applications.\n*   **Improved Performance:** Identify and optimize slow or costly parts of your LLM chains.\n*   **Data-Driven Iteration:** Make informed decisions about prompt engineering, model selection, and architecture based on real usage data and evaluations.\n*   **Cost Control:** Monitor token usage and costs to prevent budget overruns.\n*   **Enhanced Reliability:** Build more robust and production-ready LLM applications.\n\n### Integrations\n\nLangfuse integrates with popular LLM frameworks and libraries, including:\n\n*   LangChain\n*   LlamaIndex\n*   OpenAI API\n*   Anthropic API\n*   And can be used with any custom LLM integration.\n\nIn summary, Langfuse is a critical tool for any developer or team serious about building, deploying, and maintaining high-quality, performant, and reliable LLM-powered applications in production.',
            },
          ],
          source: "output",
          finishReason: {
            type: "stop",
            raw: "STOP",
          },
        },
      ],
      toolDefinitions: [],
    },
  },
  // Source: worker/src/__tests__/chatml/framework-traces/vertex-ai-2025-08-01.trace.json; observation 125abcbf5c41f4df
  {
    name: "verbatim vertex-ai-2025-08-01.trace.json / 125abcbf5c41f4df",
    spanIO: {
      input:
        '{"contents": [{"role": "user", "parts": [{"text": "What is Langfuse?"}]}], "model": "projects/vertex-ai-integration-467711/locations/europe-central2/publishers/google/models/gemini-2.5-flash", "tools": [], "labels": {}, "safety_settings": []}',
      output:
        '{"candidates": [{"content": {"role": "model", "parts": [{"text": "**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\\n\\nThink of it as an Application Performance Management (APM) tool, but tailored to the unique challenges of building and running applications powered by LLMs, such as chatbots, summarizers, code generators, and more.\\n\\n### Why Langfuse Exists (The Problem It Solves)\\n\\nDeveloping with LLMs introduces new complexities:\\n\\n1.  **Non-Determinism:** LLM outputs can vary even with the same input, making debugging difficult.\\n2.  **Opacity:** It\'s hard to see *why* an LLM responded a certain way, especially with complex prompt chains or tool usage.\\n3.  **Cost & Latency:** LLM API calls can be expensive and slow, requiring careful monitoring.\\n4.  **Quality Evaluation:** Subjective and difficult to measure if an LLM is truly \\"good\\" or \\"helpful\\" for specific tasks.\\n5.  **Iteration Speed:** Testing prompt changes, different models, or retrieval-augmented generation (RAG) strategies requires robust tooling.\\n6.  **User Feedback:** Connecting user-reported issues or satisfaction back to specific LLM interactions.\\n\\n### What Langfuse Does (Key Features)\\n\\nLangfuse helps address these problems by providing:\\n\\n1.  **Tracing & Debugging:**\\n    *   **End-to-end visibility:** It captures every step of an LLM call or a chain of LLM calls (e.g., initial user query, prompt engineering, internal thoughts of the LLM, tool calls, final response).\\n    *   **Detailed data:** Records prompts, responses, models used, tokens consumed, latency, cost, errors, and custom metadata.\\n    *   **Visual timelines:** Allows developers to inspect the flow of an interaction, pinpointing where issues occurred.\\n\\n2.  **Evaluation & Feedback:**\\n    *   **Manual Annotations:** Allows human reviewers to rate the quality of LLM outputs directly within the platform.\\n    *   **Automated Evaluations:** Integrates with evaluation frameworks to run automated checks (e.g., factual consistency, toxicity, helpfulness).\\n    *   **Feedback Integration:** Connects user feedback (e.g., thumbs up/down, specific comments) directly to the trace of the interaction.\\n\\n3.  **Monitoring & Analytics:**\\n    *   **Dashboards:** Provides metrics on key performance indicators like latency, cost, token usage, error rates, and throughput.\\n    *   **Trend Analysis:** Helps identify regressions or improvements over time.\\n    *   **Experimentation:** Facilitates A/B testing of different prompts, models, or configurations by comparing their performance metrics and evaluations.\\n\\n4.  **Prompt Management:** While not a dedicated prompt engineering tool, its tracing capabilities allow you to see how different prompts perform in production and iterate on them effectively.\\n\\n### How It Works\\n\\n*   **SDKs:** You integrate Langfuse into your application code using their SDKs (e.g., Python, JavaScript).\\n*   **Data Capture:** The SDKs automatically capture relevant data about your LLM calls and send it to the Langfuse backend.\\n*   **Backend:** Langfuse provides a hosted cloud service, or you can self-host their open-source backend (which uses PostgreSQL and ClickHouse).\\n*   **Web UI:** All the captured data is visualized in a user-friendly web interface for analysis, debugging, and evaluation.\\n\\n### Who Uses Langfuse?\\n\\n*   **LLM Developers:** For debugging, testing, and improving their LLM-powered applications.\\n*   **ML Engineers:** To monitor the performance and reliability of LLMs in production.\\n*   **Product Managers:** To understand user experience and the impact of LLM changes.\\n*   **Anyone building and deploying Generative AI applications.**\\n\\nIn essence, Langfuse provides the necessary tools for developers to bring LLM applications from prototype to production with confidence, ensuring they are observable, debuggable, and continuously improving."}]}, "finish_reason": 1, "avg_logprobs": -0.7123595830251479, "index": 0, "score": 0.0, "safety_ratings": []}], "usage_metadata": {"prompt_token_count": 5, "candidates_token_count": 845, "total_token_count": 2023}, "model_version": "gemini-2.5-flash"}',
      metadata:
        '{"attributes":{"input.value":"{\\"contents\\": [{\\"role\\": \\"user\\", \\"parts\\": [{\\"text\\": \\"What is Langfuse?\\"}]}], \\"model\\": \\"projects/vertex-ai-integration-467711/locations/europe-central2/publishers/google/models/gemini-2.5-flash\\", \\"tools\\": [], \\"labels\\": {}, \\"safety_settings\\": []}","input.mime_type":"application/json","llm.model_name":"projects/vertex-ai-integration-467711/locations/europe-central2/publishers/google/models/gemini-2.5-flash","llm.invocation_parameters":"{\\"stop_sequences\\": [], \\"response_mime_type\\": \\"\\"}","llm.input_messages.0.message.role":"user","llm.input_messages.0.message.contents.0.message_content.text":"What is Langfuse?","output.value":"{\\"candidates\\": [{\\"content\\": {\\"role\\": \\"model\\", \\"parts\\": [{\\"text\\": \\"**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\\\\n\\\\nThink of it as an Application Performance Management (APM) tool, but tailored to the unique challenges of building and running applications powered by LLMs, such as chatbots, summarizers, code generators, and more.\\\\n\\\\n### Why Langfuse Exists (The Problem It Solves)\\\\n\\\\nDeveloping with LLMs introduces new complexities:\\\\n\\\\n1.  **Non-Determinism:** LLM outputs can vary even with the same input, making debugging difficult.\\\\n2.  **Opacity:** It\'s hard to see *why* an LLM responded a certain way, especially with complex prompt chains or tool usage.\\\\n3.  **Cost & Latency:** LLM API calls can be expensive and slow, requiring careful monitoring.\\\\n4.  **Quality Evaluation:** Subjective and difficult to measure if an LLM is truly \\\\\\"good\\\\\\" or \\\\\\"helpful\\\\\\" for specific tasks.\\\\n5.  **Iteration Speed:** Testing prompt changes, different models, or retrieval-augmented generation (RAG) strategies requires robust tooling.\\\\n6.  **User Feedback:** Connecting user-reported issues or satisfaction back to specific LLM interactions.\\\\n\\\\n### What Langfuse Does (Key Features)\\\\n\\\\nLangfuse helps address these problems by providing:\\\\n\\\\n1.  **Tracing & Debugging:**\\\\n    *   **End-to-end visibility:** It captures every step of an LLM call or a chain of LLM calls (e.g., initial user query, prompt engineering, internal thoughts of the LLM, tool calls, final response).\\\\n    *   **Detailed data:** Records prompts, responses, models used, tokens consumed, latency, cost, errors, and custom metadata.\\\\n    *   **Visual timelines:** Allows developers to inspect the flow of an interaction, pinpointing where issues occurred.\\\\n\\\\n2.  **Evaluation & Feedback:**\\\\n    *   **Manual Annotations:** Allows human reviewers to rate the quality of LLM outputs directly within the platform.\\\\n    *   **Automated Evaluations:** Integrates with evaluation frameworks to run automated checks (e.g., factual consistency, toxicity, helpfulness).\\\\n    *   **Feedback Integration:** Connects user feedback (e.g., thumbs up/down, specific comments) directly to the trace of the interaction.\\\\n\\\\n3.  **Monitoring & Analytics:**\\\\n    *   **Dashboards:** Provides metrics on key performance indicators like latency, cost, token usage, error rates, and throughput.\\\\n    *   **Trend Analysis:** Helps identify regressions or improvements over time.\\\\n    *   **Experimentation:** Facilitates A/B testing of different prompts, models, or configurations by comparing their performance metrics and evaluations.\\\\n\\\\n4.  **Prompt Management:** While not a dedicated prompt engineering tool, its tracing capabilities allow you to see how different prompts perform in production and iterate on them effectively.\\\\n\\\\n### How It Works\\\\n\\\\n*   **SDKs:** You integrate Langfuse into your application code using their SDKs (e.g., Python, JavaScript).\\\\n*   **Data Capture:** The SDKs automatically capture relevant data about your LLM calls and send it to the Langfuse backend.\\\\n*   **Backend:** Langfuse provides a hosted cloud service, or you can self-host their open-source backend (which uses PostgreSQL and ClickHouse).\\\\n*   **Web UI:** All the captured data is visualized in a user-friendly web interface for analysis, debugging, and evaluation.\\\\n\\\\n### Who Uses Langfuse?\\\\n\\\\n*   **LLM Developers:** For debugging, testing, and improving their LLM-powered applications.\\\\n*   **ML Engineers:** To monitor the performance and reliability of LLMs in production.\\\\n*   **Product Managers:** To understand user experience and the impact of LLM changes.\\\\n*   **Anyone building and deploying Generative AI applications.**\\\\n\\\\nIn essence, Langfuse provides the necessary tools for developers to bring LLM applications from prototype to production with confidence, ensuring they are observable, debuggable, and continuously improving.\\"}]}, \\"finish_reason\\": 1, \\"avg_logprobs\\": -0.7123595830251479, \\"index\\": 0, \\"score\\": 0.0, \\"safety_ratings\\": []}], \\"usage_metadata\\": {\\"prompt_token_count\\": 5, \\"candidates_token_count\\": 845, \\"total_token_count\\": 2023}, \\"model_version\\": \\"gemini-2.5-flash\\"}","output.mime_type":"application/json","llm.token_count.prompt":"5","llm.token_count.completion":"845","llm.token_count.total":"2023","llm.output_messages.0.message.role":"assistant","llm.output_messages.0.message.contents.0.message_content.text":"**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\\n\\nThink of it as an Application Performance Management (APM) tool, but tailored to the unique challenges of building and running applications powered by LLMs, such as chatbots, summarizers, code generators, and more.\\n\\n### Why Langfuse Exists (The Problem It Solves)\\n\\nDeveloping with LLMs introduces new complexities:\\n\\n1.  **Non-Determinism:** LLM outputs can vary even with the same input, making debugging difficult.\\n2.  **Opacity:** It\'s hard to see *why* an LLM responded a certain way, especially with complex prompt chains or tool usage.\\n3.  **Cost & Latency:** LLM API calls can be expensive and slow, requiring careful monitoring.\\n4.  **Quality Evaluation:** Subjective and difficult to measure if an LLM is truly \\"good\\" or \\"helpful\\" for specific tasks.\\n5.  **Iteration Speed:** Testing prompt changes, different models, or retrieval-augmented generation (RAG) strategies requires robust tooling.\\n6.  **User Feedback:** Connecting user-reported issues or satisfaction back to specific LLM interactions.\\n\\n### What Langfuse Does (Key Features)\\n\\nLangfuse helps address these problems by providing:\\n\\n1.  **Tracing & Debugging:**\\n    *   **End-to-end visibility:** It captures every step of an LLM call or a chain of LLM calls (e.g., initial user query, prompt engineering, internal thoughts of the LLM, tool calls, final response).\\n    *   **Detailed data:** Records prompts, responses, models used, tokens consumed, latency, cost, errors, and custom metadata.\\n    *   **Visual timelines:** Allows developers to inspect the flow of an interaction, pinpointing where issues occurred.\\n\\n2.  **Evaluation & Feedback:**\\n    *   **Manual Annotations:** Allows human reviewers to rate the quality of LLM outputs directly within the platform.\\n    *   **Automated Evaluations:** Integrates with evaluation frameworks to run automated checks (e.g., factual consistency, toxicity, helpfulness).\\n    *   **Feedback Integration:** Connects user feedback (e.g., thumbs up/down, specific comments) directly to the trace of the interaction.\\n\\n3.  **Monitoring & Analytics:**\\n    *   **Dashboards:** Provides metrics on key performance indicators like latency, cost, token usage, error rates, and throughput.\\n    *   **Trend Analysis:** Helps identify regressions or improvements over time.\\n    *   **Experimentation:** Facilitates A/B testing of different prompts, models, or configurations by comparing their performance metrics and evaluations.\\n\\n4.  **Prompt Management:** While not a dedicated prompt engineering tool, its tracing capabilities allow you to see how different prompts perform in production and iterate on them effectively.\\n\\n### How It Works\\n\\n*   **SDKs:** You integrate Langfuse into your application code using their SDKs (e.g., Python, JavaScript).\\n*   **Data Capture:** The SDKs automatically capture relevant data about your LLM calls and send it to the Langfuse backend.\\n*   **Backend:** Langfuse provides a hosted cloud service, or you can self-host their open-source backend (which uses PostgreSQL and ClickHouse).\\n*   **Web UI:** All the captured data is visualized in a user-friendly web interface for analysis, debugging, and evaluation.\\n\\n### Who Uses Langfuse?\\n\\n*   **LLM Developers:** For debugging, testing, and improving their LLM-powered applications.\\n*   **ML Engineers:** To monitor the performance and reliability of LLMs in production.\\n*   **Product Managers:** To understand user experience and the impact of LLM changes.\\n*   **Anyone building and deploying Generative AI applications.**\\n\\nIn essence, Langfuse provides the necessary tools for developers to bring LLM applications from prototype to production with confidence, ensuring they are observable, debuggable, and continuously improving.","openinference.span.kind":"LLM"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.34.1","service.name":"unknown_service"},"scope":{"name":"openinference.instrumentation.vertexai","version":"0.1.11","attributes":{}}}',
    },
    expected: {
      messages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: "What is Langfuse?",
            },
          ],
          source: "input",
        },
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              text: '**Langfuse** is an **open-source observability and evaluation platform specifically designed for Large Language Model (LLM) applications.**\n\nThink of it as an Application Performance Management (APM) tool, but tailored to the unique challenges of building and running applications powered by LLMs, such as chatbots, summarizers, code generators, and more.\n\n### Why Langfuse Exists (The Problem It Solves)\n\nDeveloping with LLMs introduces new complexities:\n\n1.  **Non-Determinism:** LLM outputs can vary even with the same input, making debugging difficult.\n2.  **Opacity:** It\'s hard to see *why* an LLM responded a certain way, especially with complex prompt chains or tool usage.\n3.  **Cost & Latency:** LLM API calls can be expensive and slow, requiring careful monitoring.\n4.  **Quality Evaluation:** Subjective and difficult to measure if an LLM is truly "good" or "helpful" for specific tasks.\n5.  **Iteration Speed:** Testing prompt changes, different models, or retrieval-augmented generation (RAG) strategies requires robust tooling.\n6.  **User Feedback:** Connecting user-reported issues or satisfaction back to specific LLM interactions.\n\n### What Langfuse Does (Key Features)\n\nLangfuse helps address these problems by providing:\n\n1.  **Tracing & Debugging:**\n    *   **End-to-end visibility:** It captures every step of an LLM call or a chain of LLM calls (e.g., initial user query, prompt engineering, internal thoughts of the LLM, tool calls, final response).\n    *   **Detailed data:** Records prompts, responses, models used, tokens consumed, latency, cost, errors, and custom metadata.\n    *   **Visual timelines:** Allows developers to inspect the flow of an interaction, pinpointing where issues occurred.\n\n2.  **Evaluation & Feedback:**\n    *   **Manual Annotations:** Allows human reviewers to rate the quality of LLM outputs directly within the platform.\n    *   **Automated Evaluations:** Integrates with evaluation frameworks to run automated checks (e.g., factual consistency, toxicity, helpfulness).\n    *   **Feedback Integration:** Connects user feedback (e.g., thumbs up/down, specific comments) directly to the trace of the interaction.\n\n3.  **Monitoring & Analytics:**\n    *   **Dashboards:** Provides metrics on key performance indicators like latency, cost, token usage, error rates, and throughput.\n    *   **Trend Analysis:** Helps identify regressions or improvements over time.\n    *   **Experimentation:** Facilitates A/B testing of different prompts, models, or configurations by comparing their performance metrics and evaluations.\n\n4.  **Prompt Management:** While not a dedicated prompt engineering tool, its tracing capabilities allow you to see how different prompts perform in production and iterate on them effectively.\n\n### How It Works\n\n*   **SDKs:** You integrate Langfuse into your application code using their SDKs (e.g., Python, JavaScript).\n*   **Data Capture:** The SDKs automatically capture relevant data about your LLM calls and send it to the Langfuse backend.\n*   **Backend:** Langfuse provides a hosted cloud service, or you can self-host their open-source backend (which uses PostgreSQL and ClickHouse).\n*   **Web UI:** All the captured data is visualized in a user-friendly web interface for analysis, debugging, and evaluation.\n\n### Who Uses Langfuse?\n\n*   **LLM Developers:** For debugging, testing, and improving their LLM-powered applications.\n*   **ML Engineers:** To monitor the performance and reliability of LLMs in production.\n*   **Product Managers:** To understand user experience and the impact of LLM changes.\n*   **Anyone building and deploying Generative AI applications.**\n\nIn essence, Langfuse provides the necessary tools for developers to bring LLM applications from prototype to production with confidence, ensuring they are observable, debuggable, and continuously improving.',
            },
          ],
          source: "output",
        },
      ],
      toolDefinitions: [],
    },
  },
];
