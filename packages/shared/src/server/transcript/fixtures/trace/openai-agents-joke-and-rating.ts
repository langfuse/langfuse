import type { TranscriptFixture } from "../fixture-types";

/**
 * Separate agent executions generate a joke and rate it. The second prompt
 * quotes the joke inside a fresh user message rather than replaying the first
 * assistant message. Export order is preserved below.
 *
 * [SPAN] Joke workflow  t-afa1ae379b6c3a5333e2bab357f31cdc
 *   [AGENT] Joke workflow  5427d87c68697585
 *     [AGENT] Joke generator  b4b63a5f61c8689a
 *       [GENERATION] response  f8fdd8164d6f8dbe
 *     [AGENT] Joke generator  0e44622cd302dacc
 *       [GENERATION] response  496efdc060a5399b
 */

const traceId = "afa1ae379b6c3a5333e2bab357f31cdc";
const projectId = "transcript-fixture-project";

const payload1 = null;

const payload2 = JSON.stringify([
  {
    content: "Tell me a joke",
    role: "user",
  },
]);

const payload3 = JSON.stringify({
  id: "resp_05e10c6f9849abe80068db9d06bac081a08d695570d759e9df",
  created_at: 1759223046,
  error: null,
  incomplete_details: null,
  instructions: "Tell funny jokes.",
  metadata: {},
  model: "gpt-4.1-2025-04-14",
  object: "response",
  output: [
    {
      id: "msg_05e10c6f9849abe80068db9d07270c81a0ab2f2738f61c1d11",
      content: [
        {
          annotations: [],
          text: "Sure! Here’s one for you:\n\nWhy did the scarecrow win an award?\n\nBecause he was outstanding in his field! 🌾😄",
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
    input_tokens: 19,
    input_tokens_details: {
      cached_tokens: 0,
    },
    output_tokens: 30,
    output_tokens_details: {
      reasoning_tokens: 0,
    },
    total_tokens: 49,
  },
  user: null,
  billing: {
    payer: "developer",
  },
  store: true,
});

const payload4 = JSON.stringify([
  {
    content:
      "Rate this joke: Sure! Here’s one for you:\n\nWhy did the scarecrow win an award?\n\nBecause he was outstanding in his field! 🌾😄",
    role: "user",
  },
]);

const payload5 = JSON.stringify({
  id: "resp_03e1816217fbc8a30068db9d07949c81a29151e95e3c492c7e",
  created_at: 1759223047,
  error: null,
  incomplete_details: null,
  instructions: "Tell funny jokes.",
  metadata: {},
  model: "gpt-4.1-2025-04-14",
  object: "response",
  output: [
    {
      id: "msg_03e1816217fbc8a30068db9d07dbe481a28fae7f2a41f76827",
      content: [
        {
          annotations: [],
          text: "Great choice! That’s a classic joke—punny, wholesome, and easy to get. Here’s how I’d rate it:\n\n**Joke Rating: 8/10**\n\n**Why?**\n- **Punniness:** Strong, farm-fresh wordplay!\n- **Audience:** Universally funny—works for kids and adults.\n- **Originality:** Popular, but still a crowd-pleaser.\n\n**Bonus:** The addition of the emoji 🌾 gives it an extra playful touch! Want to hear a joke from me now?",
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
    input_tokens: 48,
    input_tokens_details: {
      cached_tokens: 0,
    },
    output_tokens: 111,
    output_tokens_details: {
      reasoning_tokens: 0,
    },
    total_tokens: 159,
  },
  user: null,
  billing: {
    payer: "developer",
  },
  store: true,
});

// OTel envelope shared by every observation. ClickHouse stores observation
// metadata as Map(String, String), so object-valued attributes live as JSON
// strings and round-trip back through `parseMetadataCHRecordToDomain`.
const scope = JSON.stringify({
  name: "openinference.instrumentation.openai_agents",
  version: "1.3.0",
  attributes: {},
});

const resourceAttributes = JSON.stringify({
  "telemetry.sdk.language": "python",
  "telemetry.sdk.name": "opentelemetry",
  "telemetry.sdk.version": "1.37.0",
  "service.name": "unknown_service",
});

const agentAttributes = JSON.stringify({
  "openinference.span.kind": "AGENT",
});

const generatorAttributes = JSON.stringify({
  "llm.system": "openai",
  "graph.node.id": "Joke generator",
  "openinference.span.kind": "AGENT",
});

export const openaiAgentsJokeAndRatingFixture = {
  name: "OpenAI Agents joke generation followed by rating",
  scope: "trace",
  description:
    "Separate agent executions generate a joke and rate it. The second prompt quotes the joke inside a fresh user message rather than replaying the first assistant message.",
  observations: [
    {
      trace_id: traceId,
      project_id: projectId,
      id: "t-afa1ae379b6c3a5333e2bab357f31cdc",
      parent_observation_id: null,
      type: "SPAN",
      name: "Joke workflow",
      start_time: "2025-09-30T09:04:06.678Z",
      end_time: null,
      provided_model_name: "",
      metadata: {
        scope,
        resourceAttributes,
        attributes: agentAttributes,
      },
      input: payload1,
      output: payload1,
    },
    {
      trace_id: traceId,
      project_id: projectId,
      id: "5427d87c68697585",
      parent_observation_id: "t-afa1ae379b6c3a5333e2bab357f31cdc",
      type: "AGENT",
      name: "Joke workflow",
      start_time: "2025-09-30T09:04:06.678Z",
      end_time: "2025-09-30T09:04:09.031Z",
      provided_model_name: "",
      metadata: {
        scope,
        resourceAttributes,
        attributes: agentAttributes,
      },
      input: payload1,
      output: payload1,
    },
    {
      trace_id: traceId,
      project_id: projectId,
      id: "b4b63a5f61c8689a",
      parent_observation_id: "5427d87c68697585",
      type: "AGENT",
      name: "Joke generator",
      start_time: "2025-09-30T09:04:06.679Z",
      end_time: "2025-09-30T09:04:07.521Z",
      provided_model_name: "",
      metadata: {
        scope,
        resourceAttributes,
        attributes: generatorAttributes,
      },
      input: payload1,
      output: payload1,
    },
    {
      trace_id: traceId,
      project_id: projectId,
      id: "f8fdd8164d6f8dbe",
      parent_observation_id: "b4b63a5f61c8689a",
      type: "GENERATION",
      name: "response",
      start_time: "2025-09-30T09:04:06.682Z",
      end_time: "2025-09-30T09:04:07.517Z",
      provided_model_name: "gpt-4.1-2025-04-14",
      metadata: {
        scope,
        resourceAttributes,
        attributes: JSON.stringify({
          "llm.system": "openai",
          "output.mime_type": "application/json",
          "output.value":
            '{"id":"resp_05e10c6f9849abe80068db9d06bac081a08d695570d759e9df","created_at":1759223046.0,"error":null,"incomplete_details":null,"instructions":"Tell funny jokes.","metadata":{},"model":"gpt-4.1-2025-04-14","object":"response","output":[{"id":"msg_05e10c6f9849abe80068db9d07270c81a0ab2f2738f61c1d11","content":[{"annotations":[],"text":"Sure! Here’s one for you:\\n\\nWhy did the scarecrow win an award?\\n\\nBecause he was outstanding in his field! 🌾😄","type":"output_text","logprobs":[]}],"role":"assistant","status":"completed","type":"message"}],"parallel_tool_calls":true,"temperature":1.0,"tool_choice":"auto","tools":[],"top_p":1.0,"background":false,"conversation":null,"max_output_tokens":null,"max_tool_calls":null,"previous_response_id":null,"prompt":null,"prompt_cache_key":null,"reasoning":{"effort":null,"generate_summary":null,"summary":null},"safety_identifier":null,"service_tier":"default","status":"completed","text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","usage":{"input_tokens":19,"input_tokens_details":{"cached_tokens":0},"output_tokens":30,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":49},"user":null,"billing":{"payer":"developer"},"store":true}',
          "llm.token_count.completion": "30",
          "llm.token_count.prompt": "19",
          "llm.token_count.total": "49",
          "llm.token_count.prompt_details.cache_read": "0",
          "llm.token_count.completion_details.reasoning": "0",
          "llm.output_messages.0.message.role": "assistant",
          "llm.output_messages.0.message.contents.0.message_content.type":
            "text",
          "llm.output_messages.0.message.contents.0.message_content.text":
            "Sure! Here’s one for you:\n\nWhy did the scarecrow win an award?\n\nBecause he was outstanding in his field! 🌾😄",
          "llm.input_messages.0.message.role": "system",
          "llm.input_messages.0.message.content": "Tell funny jokes.",
          "llm.model_name": "gpt-4.1-2025-04-14",
          "llm.invocation_parameters":
            '{"id": "resp_05e10c6f9849abe80068db9d06bac081a08d695570d759e9df", "created_at": 1759223046.0, "instructions": "Tell funny jokes.", "metadata": {}, "model": "gpt-4.1-2025-04-14", "parallel_tool_calls": true, "temperature": 1.0, "tool_choice": "auto", "top_p": 1.0, "background": false, "reasoning": {}, "service_tier": "default", "text": {"format": {"type": "text"}, "verbosity": "medium"}, "top_logprobs": 0, "truncation": "disabled", "billing": {"payer": "developer"}, "store": true}',
          "input.mime_type": "application/json",
          "input.value": '[{"content": "Tell me a joke", "role": "user"}]',
          "llm.input_messages.1.message.role": "user",
          "llm.input_messages.1.message.content": "Tell me a joke",
          "openinference.span.kind": "LLM",
        }),
      },
      input: payload2,
      output: payload3,
    },
    {
      trace_id: traceId,
      project_id: projectId,
      id: "0e44622cd302dacc",
      parent_observation_id: "5427d87c68697585",
      type: "AGENT",
      name: "Joke generator",
      start_time: "2025-09-30T09:04:07.521Z",
      end_time: "2025-09-30T09:04:09.030Z",
      provided_model_name: "",
      metadata: {
        scope,
        resourceAttributes,
        attributes: generatorAttributes,
      },
      input: payload1,
      output: payload1,
    },
    {
      trace_id: traceId,
      project_id: projectId,
      id: "496efdc060a5399b",
      parent_observation_id: "0e44622cd302dacc",
      type: "GENERATION",
      name: "response",
      start_time: "2025-09-30T09:04:07.522Z",
      end_time: "2025-09-30T09:04:09.029Z",
      provided_model_name: "gpt-4.1-2025-04-14",
      metadata: {
        scope,
        resourceAttributes,
        attributes: JSON.stringify({
          "llm.system": "openai",
          "output.mime_type": "application/json",
          "output.value":
            '{"id":"resp_03e1816217fbc8a30068db9d07949c81a29151e95e3c492c7e","created_at":1759223047.0,"error":null,"incomplete_details":null,"instructions":"Tell funny jokes.","metadata":{},"model":"gpt-4.1-2025-04-14","object":"response","output":[{"id":"msg_03e1816217fbc8a30068db9d07dbe481a28fae7f2a41f76827","content":[{"annotations":[],"text":"Great choice! That’s a classic joke—punny, wholesome, and easy to get. Here’s how I’d rate it:\\n\\n**Joke Rating: 8/10**\\n\\n**Why?**\\n- **Punniness:** Strong, farm-fresh wordplay!\\n- **Audience:** Universally funny—works for kids and adults.\\n- **Originality:** Popular, but still a crowd-pleaser.\\n\\n**Bonus:** The addition of the emoji 🌾 gives it an extra playful touch! Want to hear a joke from me now?","type":"output_text","logprobs":[]}],"role":"assistant","status":"completed","type":"message"}],"parallel_tool_calls":true,"temperature":1.0,"tool_choice":"auto","tools":[],"top_p":1.0,"background":false,"conversation":null,"max_output_tokens":null,"max_tool_calls":null,"previous_response_id":null,"prompt":null,"prompt_cache_key":null,"reasoning":{"effort":null,"generate_summary":null,"summary":null},"safety_identifier":null,"service_tier":"default","status":"completed","text":{"format":{"type":"text"},"verbosity":"medium"},"top_logprobs":0,"truncation":"disabled","usage":{"input_tokens":48,"input_tokens_details":{"cached_tokens":0},"output_tokens":111,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":159},"user":null,"billing":{"payer":"developer"},"store":true}',
          "llm.token_count.completion": "111",
          "llm.token_count.prompt": "48",
          "llm.token_count.total": "159",
          "llm.token_count.prompt_details.cache_read": "0",
          "llm.token_count.completion_details.reasoning": "0",
          "llm.output_messages.0.message.role": "assistant",
          "llm.output_messages.0.message.contents.0.message_content.type":
            "text",
          "llm.output_messages.0.message.contents.0.message_content.text":
            "Great choice! That’s a classic joke—punny, wholesome, and easy to get. Here’s how I’d rate it:\n\n**Joke Rating: 8/10**\n\n**Why?**\n- **Punniness:** Strong, farm-fresh wordplay!\n- **Audience:** Universally funny—works for kids and adults.\n- **Originality:** Popular, but still a crowd-pleaser.\n\n**Bonus:** The addition of the emoji 🌾 gives it an extra playful touch! Want to hear a joke from me now?",
          "llm.input_messages.0.message.role": "system",
          "llm.input_messages.0.message.content": "Tell funny jokes.",
          "llm.model_name": "gpt-4.1-2025-04-14",
          "llm.invocation_parameters":
            '{"id": "resp_03e1816217fbc8a30068db9d07949c81a29151e95e3c492c7e", "created_at": 1759223047.0, "instructions": "Tell funny jokes.", "metadata": {}, "model": "gpt-4.1-2025-04-14", "parallel_tool_calls": true, "temperature": 1.0, "tool_choice": "auto", "top_p": 1.0, "background": false, "reasoning": {}, "service_tier": "default", "text": {"format": {"type": "text"}, "verbosity": "medium"}, "top_logprobs": 0, "truncation": "disabled", "billing": {"payer": "developer"}, "store": true}',
          "input.mime_type": "application/json",
          "input.value":
            '[{"content": "Rate this joke: Sure! Here’s one for you:\\n\\nWhy did the scarecrow win an award?\\n\\nBecause he was outstanding in his field! 🌾😄", "role": "user"}]',
          "llm.input_messages.1.message.role": "user",
          "llm.input_messages.1.message.content":
            "Rate this joke: Sure! Here’s one for you:\n\nWhy did the scarecrow win an award?\n\nBecause he was outstanding in his field! 🌾😄",
          "openinference.span.kind": "LLM",
        }),
      },
      input: payload4,
      output: payload5,
    },
  ],
  expected: undefined,
} satisfies TranscriptFixture;
