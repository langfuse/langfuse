import { expect } from "vitest";
import type { NormalizedIOFixture } from "../fixture-types";

export const agnoPythonReprFixture = {
  name: "normalizes an Agno Python-repr message",
  spanIO: {
    input:
      "role='user' content='What is the weather?' name=None tool_call_id=None",
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather?" }],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

// Verbatim stored observation IO from ChatML integration-example exports.
// Expected messages are authored from source payloads, not normalizer snapshots.
export const capturedTraceFixtures: NormalizedIOFixture[] = [
  // Source: worker/src/__tests__/chatml/framework-traces/agno-2025-06-11.trace.json; observation ca136de468e156c9
  {
    name: "verbatim agno-2025-06-11.trace.json / ca136de468e156c9",
    spanIO: {
      input:
        '{"messages": ["role=\'system\' content=\'<additional_information>\\\\n- Use markdown to format your answers.\\\\n</additional_information>\' name=None tool_call_id=None tool_calls=None audio=None images=None videos=None files=None audio_output=None image_output=None thinking=None redacted_thinking=None provider_data=None citations=None reasoning_content=None tool_name=None tool_args=None tool_call_error=None stop_after_tool_call=False add_to_agent_memory=True from_history=False metrics=MessageMetrics(input_tokens=0, output_tokens=0, total_tokens=0, audio_tokens=0, input_audio_tokens=0, output_audio_tokens=0, cached_tokens=0, reasoning_tokens=0, prompt_tokens=0, completion_tokens=0, prompt_tokens_details=None, completion_tokens_details=None, additional_metrics=None, time=None, time_to_first_token=None, timer=None) references=None created_at=1749650492", "role=\'user\' content=\'What is currently trending on Twitter?\' name=None tool_call_id=None tool_calls=None audio=None images=None videos=None files=None audio_output=None image_output=None thinking=None redacted_thinking=None provider_data=None citations=None reasoning_content=None tool_name=None tool_args=None tool_call_error=None stop_after_tool_call=False add_to_agent_memory=True from_history=False metrics=MessageMetrics(input_tokens=0, output_tokens=0, total_tokens=0, audio_tokens=0, input_audio_tokens=0, output_audio_tokens=0, cached_tokens=0, reasoning_tokens=0, prompt_tokens=0, completion_tokens=0, prompt_tokens_details=None, completion_tokens_details=None, additional_metrics=None, time=None, time_to_first_token=None, timer=None) references=None created_at=1749650492"], "tools": [{"type": "function", "function": {"name": "duckduckgo_search", "description": "Use this function to search DuckDuckGo for a query.", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "(str) The query to search for."}, "max_results": {"type": "number", "description": "(optional, default=5) The maximum number of results to return."}}, "required": ["query"]}, "requires_confirmation": false, "external_execution": false}}, {"type": "function", "function": {"name": "duckduckgo_news", "description": "Use this function to get the latest news from DuckDuckGo.", "parameters": {"type": "object", "properties": {"query": {"type": "string", "description": "(str) The query to search for."}, "max_results": {"type": "number", "description": "(optional, default=5) The maximum number of results to return."}}, "required": ["query"]}, "requires_confirmation": false, "external_execution": false}}]}',
      output:
        '{"id":"chatcmpl-BhGJAW79iSsHO7ES5wgoTga4hQFyn","choices":[{"finish_reason":"tool_calls","index":0,"logprobs":null,"message":{"content":null,"refusal":null,"role":"assistant","annotations":[],"audio":null,"function_call":null,"tool_calls":[{"id":"call_VybxG748CQId8Xxo6wb2pWy1","function":{"arguments":"{\\"query\\":\\"currently trending on Twitter\\"}","name":"duckduckgo_search"},"type":"function"}]}}],"created":1749650492,"model":"gpt-4o-mini-2024-07-18","object":"chat.completion","service_tier":"default","system_fingerprint":"fp_34a54ae93c","usage":{"completion_tokens":20,"prompt_tokens":163,"total_tokens":183,"completion_tokens_details":{"accepted_prediction_tokens":0,"audio_tokens":0,"reasoning_tokens":0,"rejected_prediction_tokens":0},"prompt_tokens_details":{"audio_tokens":0,"cached_tokens":0}}}',
      metadata:
        '{"attributes":{"input.mime_type":"application/json","input.value":"{\\"messages\\": [\\"role=\'system\' content=\'<additional_information>\\\\\\\\n- Use markdown to format your answers.\\\\\\\\n</additional_information>\' name=None tool_call_id=None tool_calls=None audio=None images=None videos=None files=None audio_output=None image_output=None thinking=None redacted_thinking=None provider_data=None citations=None reasoning_content=None tool_name=None tool_args=None tool_call_error=None stop_after_tool_call=False add_to_agent_memory=True from_history=False metrics=MessageMetrics(input_tokens=0, output_tokens=0, total_tokens=0, audio_tokens=0, input_audio_tokens=0, output_audio_tokens=0, cached_tokens=0, reasoning_tokens=0, prompt_tokens=0, completion_tokens=0, prompt_tokens_details=None, completion_tokens_details=None, additional_metrics=None, time=None, time_to_first_token=None, timer=None) references=None created_at=1749650492\\", \\"role=\'user\' content=\'What is currently trending on Twitter?\' name=None tool_call_id=None tool_calls=None audio=None images=None videos=None files=None audio_output=None image_output=None thinking=None redacted_thinking=None provider_data=None citations=None reasoning_content=None tool_name=None tool_args=None tool_call_error=None stop_after_tool_call=False add_to_agent_memory=True from_history=False metrics=MessageMetrics(input_tokens=0, output_tokens=0, total_tokens=0, audio_tokens=0, input_audio_tokens=0, output_audio_tokens=0, cached_tokens=0, reasoning_tokens=0, prompt_tokens=0, completion_tokens=0, prompt_tokens_details=None, completion_tokens_details=None, additional_metrics=None, time=None, time_to_first_token=None, timer=None) references=None created_at=1749650492\\"], \\"tools\\": [{\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"duckduckgo_search\\", \\"description\\": \\"Use this function to search DuckDuckGo for a query.\\", \\"parameters\\": {\\"type\\": \\"object\\", \\"properties\\": {\\"query\\": {\\"type\\": \\"string\\", \\"description\\": \\"(str) The query to search for.\\"}, \\"max_results\\": {\\"type\\": \\"number\\", \\"description\\": \\"(optional, default=5) The maximum number of results to return.\\"}}, \\"required\\": [\\"query\\"]}, \\"requires_confirmation\\": false, \\"external_execution\\": false}}, {\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"duckduckgo_news\\", \\"description\\": \\"Use this function to get the latest news from DuckDuckGo.\\", \\"parameters\\": {\\"type\\": \\"object\\", \\"properties\\": {\\"query\\": {\\"type\\": \\"string\\", \\"description\\": \\"(str) The query to search for.\\"}, \\"max_results\\": {\\"type\\": \\"number\\", \\"description\\": \\"(optional, default=5) The maximum number of results to return.\\"}}, \\"required\\": [\\"query\\"]}, \\"requires_confirmation\\": false, \\"external_execution\\": false}}]}","llm.input_messages.0.message.role":"system","llm.input_messages.0.message.content":"<additional_information>\\n- Use markdown to format your answers.\\n</additional_information>","llm.input_messages.1.message.role":"user","llm.input_messages.1.message.content":"What is currently trending on Twitter?","llm.tools.0.tool.json_schema":"{\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"duckduckgo_search\\", \\"description\\": \\"Use this function to search DuckDuckGo for a query.\\", \\"parameters\\": {\\"type\\": \\"object\\", \\"properties\\": {\\"query\\": {\\"type\\": \\"string\\", \\"description\\": \\"(str) The query to search for.\\"}, \\"max_results\\": {\\"type\\": \\"number\\", \\"description\\": \\"(optional, default=5) The maximum number of results to return.\\"}}, \\"required\\": [\\"query\\"]}, \\"requires_confirmation\\": false, \\"external_execution\\": false}}","llm.tools.1.tool.json_schema":"{\\"type\\": \\"function\\", \\"function\\": {\\"name\\": \\"duckduckgo_news\\", \\"description\\": \\"Use this function to get the latest news from DuckDuckGo.\\", \\"parameters\\": {\\"type\\": \\"object\\", \\"properties\\": {\\"query\\": {\\"type\\": \\"string\\", \\"description\\": \\"(str) The query to search for.\\"}, \\"max_results\\": {\\"type\\": \\"number\\", \\"description\\": \\"(optional, default=5) The maximum number of results to return.\\"}}, \\"required\\": [\\"query\\"]}, \\"requires_confirmation\\": false, \\"external_execution\\": false}}","llm.model_name":"gpt-4o-mini","llm.provider":"OpenAI","output.mime_type":"application/json","output.value":"{\\"id\\":\\"chatcmpl-BhGJAW79iSsHO7ES5wgoTga4hQFyn\\",\\"choices\\":[{\\"finish_reason\\":\\"tool_calls\\",\\"index\\":0,\\"logprobs\\":null,\\"message\\":{\\"content\\":null,\\"refusal\\":null,\\"role\\":\\"assistant\\",\\"annotations\\":[],\\"audio\\":null,\\"function_call\\":null,\\"tool_calls\\":[{\\"id\\":\\"call_VybxG748CQId8Xxo6wb2pWy1\\",\\"function\\":{\\"arguments\\":\\"{\\\\\\"query\\\\\\":\\\\\\"currently trending on Twitter\\\\\\"}\\",\\"name\\":\\"duckduckgo_search\\"},\\"type\\":\\"function\\"}]}}],\\"created\\":1749650492,\\"model\\":\\"gpt-4o-mini-2024-07-18\\",\\"object\\":\\"chat.completion\\",\\"service_tier\\":\\"default\\",\\"system_fingerprint\\":\\"fp_34a54ae93c\\",\\"usage\\":{\\"completion_tokens\\":20,\\"prompt_tokens\\":163,\\"total_tokens\\":183,\\"completion_tokens_details\\":{\\"accepted_prediction_tokens\\":0,\\"audio_tokens\\":0,\\"reasoning_tokens\\":0,\\"rejected_prediction_tokens\\":0},\\"prompt_tokens_details\\":{\\"audio_tokens\\":0,\\"cached_tokens\\":0}}}","openinference.span.kind":"LLM"},"resourceAttributes":{"telemetry.sdk.language":"python","telemetry.sdk.name":"opentelemetry","telemetry.sdk.version":"1.33.1","service.name":"unknown_service"},"scope":{"name":"openinference.instrumentation.agno","version":"0.1.4","attributes":{}}}',
    },
    expected: {
      messages: expect.arrayContaining([
        expect.objectContaining({
          source: "input",
          role: "user",
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: "What is currently trending on Twitter?",
            }),
          ]),
        }),
        expect.objectContaining({
          source: "output",
          role: "assistant",
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: "tool-call",
              toolCallId: "call_VybxG748CQId8Xxo6wb2pWy1",
              toolName: "duckduckgo_search",
              input: { query: "currently trending on Twitter" },
            }),
          ]),
        }),
      ]),
      toolDefinitions: expect.any(Array),
    },
  },
];
