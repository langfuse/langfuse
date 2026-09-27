import type { TranscriptFixture } from "../fixture-types";

/**
 * Agent workflow -> Triage agent -> response + handoff tool;
 * Agent workflow -> Spanish agent -> response.
 * Repeated (trace ID, observation ID) pairs retain their first exported row.
 */
export const openaiAgentsSpanishHandoffFixture = {
  name: "OpenAI Agents Spanish handoff",
  description:
    "Triage hands off to a Spanish agent. This exercises changing instructions and agent handoff. Duplicate observation/trace ID pairs are removed, preserving first-occurrence order.",
  observations: [
    {
      project_id: "transcript-fixture-project",
      id: "t-c376e44920527b875add9d97b4ed9312",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: null,
      type: "SPAN",
      name: "Agent workflow",
      start_time: "2025-09-30T09:03:51.191Z",
      end_time: null,
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "openinference.span.kind": "AGENT",
        }),
      },
      provided_model_name: "",
      input: null,
      output: null,
    },
    {
      project_id: "transcript-fixture-project",
      id: "566127d0952130b9",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: "5cc6d9aebded54a0",
      type: "AGENT",
      name: "Triage agent",
      start_time: "2025-09-30T09:03:51.191Z",
      end_time: "2025-09-30T09:03:52.758Z",
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "llm.system": "openai",
          "graph.node.id": "Triage agent",
          "openinference.span.kind": "AGENT",
        }),
      },
      provided_model_name: "",
      input: null,
      output: null,
    },
    {
      project_id: "transcript-fixture-project",
      id: "5cc6d9aebded54a0",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: "t-c376e44920527b875add9d97b4ed9312",
      type: "AGENT",
      name: "Agent workflow",
      start_time: "2025-09-30T09:03:51.191Z",
      end_time: "2025-09-30T09:03:54.434Z",
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "openinference.span.kind": "AGENT",
        }),
      },
      provided_model_name: "",
      input: null,
      output: null,
    },
    {
      project_id: "transcript-fixture-project",
      id: "94a1dc00d7067ae8",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: "566127d0952130b9",
      type: "GENERATION",
      name: "response",
      start_time: "2025-09-30T09:03:51.192Z",
      end_time: "2025-09-30T09:03:52.756Z",
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "llm.system": "openai",
          "output.mime_type": "application/json",
          "output.value":
            '{"id":"resp_000230c027f4a45e0068db9cf79e6c81a3a60bf6b6233384f5","created_at":1759223031.0,"error":null,"incomplete_details":null,"instructions":"Handoff to the appropriate agent based on the language of the request.","metadata":{},"model":"gpt-4.1-2025-04-14","object":"response","output":[{"arguments":"{}","call_id":"call_i81vsF01rKH8cDZ0SLQQBUA2","name":"transfer_to_spanish_agent","type":"function_call","id":"fc_000230c027f4a45e0068db9cf8930481a3970aa5df55a731e3","status":"completed"}],"parallel_tool_calls":true,"temperature":1.0,"tool_choice":"auto","tools":[{"name":"transfer_to_spanish_agent","parameters":{"additionalProperties":false,"type":"object","properties":{},"required":[]},"strict":true,"type":"function","description":"Handoff to the Spanish agent agent to handle the request. "},{"name":"transfer_to_english_agent","parameters":{"additionalProperties":false,"type":"object","properties":{},"required":[]},"strict":true,"type":"function","description":"Handoff to the English agent agent to handle the request. "}],"top_p":1.0,"background":false,"conversation":null,"max_output_tokens":null,"max_tool_calls":null,"previous_response_id":null,"prompt":null,"prompt_cache_key":null,"reasoning":{"effort":null,"generate_summary":null,"summary":null},"safety_identifier":null,"service_tier":"default","status":"completed","text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","usage":{"input_tokens":87,"input_tokens_details":{"cached_tokens":0},"output_tokens":14,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":101},"user":null,"billing":{"payer":"developer"},"store":true}',
          "llm.tools.0.tool.json_schema":
            '{"type": "function", "function": {"name": "transfer_to_spanish_agent", "description": "Handoff to the Spanish agent agent to handle the request. ", "parameters": {"additionalProperties": false, "type": "object", "properties": {}, "required": []}, "strict": true}}',
          "llm.tools.1.tool.json_schema":
            '{"type": "function", "function": {"name": "transfer_to_english_agent", "description": "Handoff to the English agent agent to handle the request. ", "parameters": {"additionalProperties": false, "type": "object", "properties": {}, "required": []}, "strict": true}}',
          "llm.token_count.completion": "14",
          "llm.token_count.prompt": "87",
          "llm.token_count.total": "101",
          "llm.token_count.prompt_details.cache_read": "0",
          "llm.token_count.completion_details.reasoning": "0",
          "llm.output_messages.0.message.role": "assistant",
          "llm.output_messages.0.message.tool_calls.0.tool_call.id":
            "call_i81vsF01rKH8cDZ0SLQQBUA2",
          "llm.output_messages.0.message.tool_calls.0.tool_call.function.name":
            "transfer_to_spanish_agent",
          "llm.input_messages.0.message.role": "system",
          "llm.input_messages.0.message.content":
            "Handoff to the appropriate agent based on the language of the request.",
          "llm.model_name": "gpt-4.1-2025-04-14",
          "llm.invocation_parameters":
            '{"id": "resp_000230c027f4a45e0068db9cf79e6c81a3a60bf6b6233384f5", "created_at": 1759223031.0, "instructions": "Handoff to the appropriate agent based on the language of the request.", "metadata": {}, "model": "gpt-4.1-2025-04-14", "parallel_tool_calls": true, "temperature": 1.0, "tool_choice": "auto", "top_p": 1.0, "background": false, "reasoning": {}, "service_tier": "default", "text": {"format": {"type": "text"}, "verbosity": "medium"}, "top_logprobs": 0, "truncation": "disabled", "billing": {"payer": "developer"}, "store": true}',
          "input.mime_type": "application/json",
          "input.value": '[{"content": "Hola, ¿cómo estás?", "role": "user"}]',
          "llm.input_messages.1.message.role": "user",
          "llm.input_messages.1.message.content": "Hola, ¿cómo estás?",
          "openinference.span.kind": "LLM",
        }),
      },
      provided_model_name: "gpt-4.1-2025-04-14",
      input: JSON.stringify([
        {
          content: "Hola, ¿cómo estás?",
          role: "user",
        },
      ]),
      output: JSON.stringify({
        id: "resp_000230c027f4a45e0068db9cf79e6c81a3a60bf6b6233384f5",
        created_at: 1759223031,
        error: null,
        incomplete_details: null,
        instructions:
          "Handoff to the appropriate agent based on the language of the request.",
        metadata: {},
        model: "gpt-4.1-2025-04-14",
        object: "response",
        output: [
          {
            arguments: "{}",
            call_id: "call_i81vsF01rKH8cDZ0SLQQBUA2",
            name: "transfer_to_spanish_agent",
            type: "function_call",
            id: "fc_000230c027f4a45e0068db9cf8930481a3970aa5df55a731e3",
            status: "completed",
          },
        ],
        parallel_tool_calls: true,
        temperature: 1,
        tool_choice: "auto",
        tools: [
          {
            name: "transfer_to_spanish_agent",
            parameters: {
              additionalProperties: false,
              type: "object",
              properties: {},
              required: [],
            },
            strict: true,
            type: "function",
            description:
              "Handoff to the Spanish agent agent to handle the request. ",
          },
          {
            name: "transfer_to_english_agent",
            parameters: {
              additionalProperties: false,
              type: "object",
              properties: {},
              required: [],
            },
            strict: true,
            type: "function",
            description:
              "Handoff to the English agent agent to handle the request. ",
          },
        ],
        top_p: 1,
        background: false,
        conversation: null,
        max_output_tokens: null,
        max_tool_calls: null,
        previous_response_id: null,
        prompt: null,
        prompt_cache_key: null,
        reasoning: {
          effort: null,
          generate_summary: null,
          summary: null,
        },
        safety_identifier: null,
        service_tier: "default",
        status: "completed",
        text: {
          format: {
            type: "text",
          },
          verbosity: "medium",
        },
        top_logprobs: 0,
        truncation: "disabled",
        usage: {
          input_tokens: 87,
          input_tokens_details: {
            cached_tokens: 0,
          },
          output_tokens: 14,
          output_tokens_details: {
            reasoning_tokens: 0,
          },
          total_tokens: 101,
        },
        user: null,
        billing: {
          payer: "developer",
        },
        store: true,
      }),
    },
    {
      project_id: "transcript-fixture-project",
      id: "b1d77be34cecb5b5",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: "566127d0952130b9",
      type: "TOOL",
      name: "handoff to Spanish agent",
      start_time: "2025-09-30T09:03:52.758Z",
      end_time: "2025-09-30T09:03:52.758Z",
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "llm.system": "openai",
          "openinference.span.kind": "TOOL",
        }),
      },
      provided_model_name: "",
      input: null,
      output: null,
    },
    {
      project_id: "transcript-fixture-project",
      id: "670e91064be3fb11",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: "5cc6d9aebded54a0",
      type: "AGENT",
      name: "Spanish agent",
      start_time: "2025-09-30T09:03:52.759Z",
      end_time: "2025-09-30T09:03:54.434Z",
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "llm.system": "openai",
          "graph.node.id": "Spanish agent",
          "graph.node.parent_id": "Triage agent",
          "openinference.span.kind": "AGENT",
        }),
      },
      provided_model_name: "",
      input: null,
      output: null,
    },
    {
      project_id: "transcript-fixture-project",
      id: "a0391ae77593ad0c",
      trace_id: "c376e44920527b875add9d97b4ed9312",
      parent_observation_id: "670e91064be3fb11",
      type: "GENERATION",
      name: "response",
      start_time: "2025-09-30T09:03:52.760Z",
      end_time: "2025-09-30T09:03:54.433Z",
      metadata: {
        scope: JSON.stringify({
          name: "openinference.instrumentation.openai_agents",
          version: "1.3.0",
          attributes: {},
        }),
        resourceAttributes: JSON.stringify({
          "telemetry.sdk.language": "python",
          "telemetry.sdk.name": "opentelemetry",
          "telemetry.sdk.version": "1.37.0",
          "service.name": "unknown_service",
        }),
        attributes: JSON.stringify({
          "llm.system": "openai",
          "output.mime_type": "application/json",
          "output.value":
            '{"id":"resp_000230c027f4a45e0068db9cf8d9f481a380b1ab4e2f52dd8a","created_at":1759223033.0,"error":null,"incomplete_details":null,"instructions":"You only speak Spanish.","metadata":{},"model":"gpt-4.1-2025-04-14","object":"response","output":[{"id":"msg_000230c027f4a45e0068db9cf9d14481a3a04289f3f1b0f9a1","content":[{"annotations":[],"text":"¡Hola! Estoy muy bien, gracias. ¿Y tú, cómo estás?","type":"output_text","logprobs":[]}],"role":"assistant","status":"completed","type":"message"}],"parallel_tool_calls":true,"temperature":1.0,"tool_choice":"auto","tools":[],"top_p":1.0,"background":false,"conversation":null,"max_output_tokens":null,"max_tool_calls":null,"previous_response_id":null,"prompt":null,"prompt_cache_key":null,"reasoning":{"effort":null,"generate_summary":null,"summary":null},"safety_identifier":null,"service_tier":"default","status":"completed","text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","usage":{"input_tokens":54,"input_tokens_details":{"cached_tokens":0},"output_tokens":17,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":71},"user":null,"billing":{"payer":"developer"},"store":true}',
          "llm.token_count.completion": "17",
          "llm.token_count.prompt": "54",
          "llm.token_count.total": "71",
          "llm.token_count.prompt_details.cache_read": "0",
          "llm.token_count.completion_details.reasoning": "0",
          "llm.output_messages.0.message.role": "assistant",
          "llm.output_messages.0.message.contents.0.message_content.type":
            "text",
          "llm.output_messages.0.message.contents.0.message_content.text":
            "¡Hola! Estoy muy bien, gracias. ¿Y tú, cómo estás?",
          "llm.input_messages.0.message.role": "system",
          "llm.input_messages.0.message.content": "You only speak Spanish.",
          "llm.model_name": "gpt-4.1-2025-04-14",
          "llm.invocation_parameters":
            '{"id": "resp_000230c027f4a45e0068db9cf8d9f481a380b1ab4e2f52dd8a", "created_at": 1759223033.0, "instructions": "You only speak Spanish.", "metadata": {}, "model": "gpt-4.1-2025-04-14", "parallel_tool_calls": true, "temperature": 1.0, "tool_choice": "auto", "top_p": 1.0, "background": false, "reasoning": {}, "service_tier": "default", "text": {"format": {"type": "text"}, "verbosity": "medium"}, "top_logprobs": 0, "truncation": "disabled", "billing": {"payer": "developer"}, "store": true}',
          "input.mime_type": "application/json",
          "input.value":
            '[{"content": "Hola, ¿cómo estás?", "role": "user"}, {"arguments": "{}", "call_id": "call_i81vsF01rKH8cDZ0SLQQBUA2", "name": "transfer_to_spanish_agent", "type": "function_call", "id": "fc_000230c027f4a45e0068db9cf8930481a3970aa5df55a731e3", "status": "completed"}, {"call_id": "call_i81vsF01rKH8cDZ0SLQQBUA2", "output": "{\\"assistant\\": \\"Spanish agent\\"}", "type": "function_call_output"}]',
          "llm.input_messages.1.message.role": "user",
          "llm.input_messages.1.message.content": "Hola, ¿cómo estás?",
          "llm.input_messages.2.message.role": "assistant",
          "llm.input_messages.2.message.tool_calls.0.tool_call.id":
            "call_i81vsF01rKH8cDZ0SLQQBUA2",
          "llm.input_messages.2.message.tool_calls.0.tool_call.function.name":
            "transfer_to_spanish_agent",
          "llm.input_messages.3.message.role": "tool",
          "llm.input_messages.3.message.tool_call_id":
            "call_i81vsF01rKH8cDZ0SLQQBUA2",
          "llm.input_messages.3.message.content":
            '{"assistant": "Spanish agent"}',
          "openinference.span.kind": "LLM",
        }),
      },
      provided_model_name: "gpt-4.1-2025-04-14",
      input: JSON.stringify([
        {
          content: "Hola, ¿cómo estás?",
          role: "user",
        },
        {
          arguments: "{}",
          call_id: "call_i81vsF01rKH8cDZ0SLQQBUA2",
          name: "transfer_to_spanish_agent",
          type: "function_call",
          id: "fc_000230c027f4a45e0068db9cf8930481a3970aa5df55a731e3",
          status: "completed",
        },
        {
          call_id: "call_i81vsF01rKH8cDZ0SLQQBUA2",
          output: '{"assistant": "Spanish agent"}',
          type: "function_call_output",
        },
      ]),
      output: JSON.stringify({
        id: "resp_000230c027f4a45e0068db9cf8d9f481a380b1ab4e2f52dd8a",
        created_at: 1759223033,
        error: null,
        incomplete_details: null,
        instructions: "You only speak Spanish.",
        metadata: {},
        model: "gpt-4.1-2025-04-14",
        object: "response",
        output: [
          {
            id: "msg_000230c027f4a45e0068db9cf9d14481a3a04289f3f1b0f9a1",
            content: [
              {
                annotations: [],
                text: "¡Hola! Estoy muy bien, gracias. ¿Y tú, cómo estás?",
                type: "output_text",
                logprobs: [],
              },
            ],
            role: "assistant",
            status: "completed",
            type: "message",
          },
        ],
        parallel_tool_calls: true,
        temperature: 1,
        tool_choice: "auto",
        tools: [],
        top_p: 1,
        background: false,
        conversation: null,
        max_output_tokens: null,
        max_tool_calls: null,
        previous_response_id: null,
        prompt: null,
        prompt_cache_key: null,
        reasoning: {
          effort: null,
          generate_summary: null,
          summary: null,
        },
        safety_identifier: null,
        service_tier: "default",
        status: "completed",
        text: {
          format: {
            type: "text",
          },
          verbosity: "medium",
        },
        top_logprobs: 0,
        truncation: "disabled",
        usage: {
          input_tokens: 54,
          input_tokens_details: {
            cached_tokens: 0,
          },
          output_tokens: 17,
          output_tokens_details: {
            reasoning_tokens: 0,
          },
          total_tokens: 71,
        },
        user: null,
        billing: {
          payer: "developer",
        },
        store: true,
      }),
    },
  ],
  expected: {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "text",
                  text: "Hola, ¿cómo estás?",
                },
              ],
              source: "input",
              observationId: "94a1dc00d7067ae8",
              traceId: "c376e44920527b875add9d97b4ed9312",
            },
            {
              role: "assistant",
              parts: [
                {
                  type: "tool-call",
                  toolCallId: "call_i81vsF01rKH8cDZ0SLQQBUA2",
                  toolName: "transfer_to_spanish_agent",
                  input: {},
                  toolType: "function_call",
                  providerMetadata: {
                    status: "completed",
                  },
                },
              ],
              source: "output",
              observationId: "94a1dc00d7067ae8",
              traceId: "c376e44920527b875add9d97b4ed9312",
            },
            {
              role: "tool",
              source: "output",
              parts: [
                {
                  type: "tool-result",
                  toolCallId: "call_i81vsF01rKH8cDZ0SLQQBUA2",
                  output: {
                    assistant: "Spanish agent",
                  },
                },
              ],
              observationId: "a0391ae77593ad0c",
              traceId: "c376e44920527b875add9d97b4ed9312",
            },
            {
              id: "msg_000230c027f4a45e0068db9cf9d14481a3a04289f3f1b0f9a1",
              role: "assistant",
              parts: [
                {
                  type: "text",
                  text: "¡Hola! Estoy muy bien, gracias. ¿Y tú, cómo estás?",
                  providerMetadata: {
                    logprobs: [],
                  },
                },
              ],
              source: "output",
              observationId: "a0391ae77593ad0c",
              traceId: "c376e44920527b875add9d97b4ed9312",
            },
          ],
          observations: [
            {
              id: "94a1dc00d7067ae8",
              traceId: "c376e44920527b875add9d97b4ed9312",
            },
            {
              id: "a0391ae77593ad0c",
              traceId: "c376e44920527b875add9d97b4ed9312",
            },
          ],
        },
      },
    ],
  },
} satisfies TranscriptFixture;
