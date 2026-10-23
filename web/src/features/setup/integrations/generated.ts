/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from langfuse/langfuse-docs@7add18f content/integrations by scripts/generate-integrations.mjs.
 * Regenerate with: pnpm --filter web run generate:integrations [-- --from <langfuse-docs checkout>]
 */
import type { Integration, IntegrationCategory } from "./types";

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  { id: "native", title: "SDKs & OpenTelemetry" },
  { id: "frameworks", title: "Frameworks" },
  { id: "model-providers", title: "Model providers" },
  { id: "gateways", title: "Gateways" },
  { id: "no-code", title: "No-code agent builders" },
  { id: "developer-tools", title: "Developer tools" },
  { id: "other", title: "Other" },
];

export const INTEGRATIONS: Integration[] = [
  {
    slug: "python-sdk",
    name: "Python SDK",
    category: "native",
    description:
      "Trace any Python app with the Langfuse SDK and the @observe decorator.",
    href: "https://langfuse.com/docs/observability/sdk/overview",
  },
  {
    slug: "js-ts-sdk",
    name: "JS/TS SDK",
    category: "native",
    description:
      "Trace any JavaScript or TypeScript app with the Langfuse SDK on OpenTelemetry.",
    href: "https://langfuse.com/docs/observability/sdk/overview",
  },
  {
    slug: "opentelemetry",
    name: "OpenTelemetry",
    category: "native",
    description:
      "Connect Langfuse to OpenTelemetry (OTEL) and send OTLP traces from your application or collector to Langfuse.",
    href: "https://langfuse.com/integrations/native/opentelemetry",
    logo: {
      src: "https://langfuse.com/images/integrations/opentelemetry_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "agno-agents",
    name: "Agno",
    category: "frameworks",
    description: "Learn how to integrate Langfuse with Agno via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/agno-agents",
    logo: {
      src: "https://langfuse.com/images/integrations/agno_icon.jpg",
      appearance: "color",
    },
  },
  {
    slug: "ai-sdk-cpp",
    name: "AI SDK C++",
    category: "frameworks",
    description:
      "Learn how to instrument AI SDK C++ applications with Langfuse to trace LLM calls, tool invocations, and multi-step agent runs.",
    href: "https://langfuse.com/integrations/frameworks/ai-sdk-cpp",
    logo: {
      src: "https://langfuse.com/images/integrations/clickhouse_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "amazon-agentcore",
    name: "Amazon Bedrock AgentCore",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Amazon Bedrock AgentCore for comprehensive tracing, evaluation, and continuous improvement of your AI agents.",
    href: "https://langfuse.com/integrations/frameworks/amazon-agentcore",
    logo: {
      src: "https://langfuse.com/images/integrations/bedrock_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "autogen",
    name: "AutoGen",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with AutoGen via OpenTelemetry using OpenLit for comprehensive tracing and debugging of your AI agent conversations.",
    href: "https://langfuse.com/integrations/frameworks/autogen",
    logo: {
      src: "https://langfuse.com/images/integrations/autogen_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "beeai",
    name: "BeeAI",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with the BeeAI Framework for comprehensive tracing and debugging of your AI agent applications.",
    href: "https://langfuse.com/integrations/frameworks/beeai",
    logo: {
      src: "https://langfuse.com/images/integrations/beeai_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "claude-agent-sdk",
    name: "Claude Agent SDK",
    category: "frameworks",
    description:
      "Learn how to trace Claude Agent SDK applications with Langfuse via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/claude-agent-sdk",
    logo: {
      src: "https://langfuse.com/images/integrations/claude_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "claude-agent-sdk-js",
    name: "Claude Agent SDK (JS/TS)",
    category: "frameworks",
    description:
      "Learn how to trace Claude Agent SDK applications in JS/TS with Langfuse via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/claude-agent-sdk-js",
    logo: {
      src: "https://langfuse.com/images/integrations/claude_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "crewai",
    name: "CrewAI",
    category: "frameworks",
    description:
      "Discover how to integrate Langfuse with CrewAI for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/frameworks/crewai",
    logo: {
      src: "https://langfuse.com/images/integrations/crewai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "dspy",
    name: "DSPy",
    category: "frameworks",
    description:
      "Open-source observability for DSPy, a framework that systematically optimizes language model prompts and weights.",
    href: "https://langfuse.com/integrations/frameworks/dspy",
    logo: {
      src: "https://langfuse.com/images/integrations/dspy_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "eve",
    name: "Eve",
    category: "frameworks",
    description: "Trace eve agents with Langfuse via OpenTelemetry.",
    href: "https://langfuse.com/integrations/frameworks/eve",
    logo: {
      src: "https://langfuse.com/images/integrations/vercel_ai_sdk_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "flue",
    name: "Flue",
    category: "frameworks",
    description:
      "Learn how to trace Flue agents and workflows with Langfuse via OpenTelemetry.",
    href: "https://langfuse.com/integrations/frameworks/flue",
    logo: {
      src: "https://langfuse.com/images/integrations/flue_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "google-adk",
    name: "Google ADK",
    category: "frameworks",
    description:
      "Learn how to instrument Google ADK agents with Langfuse via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/google-adk",
    logo: {
      src: "https://langfuse.com/images/integrations/google_adk_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "haystack",
    name: "Haystack",
    category: "frameworks",
    description:
      "Discover how to integrate Langfuse with Deepset's Haystack for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/frameworks/haystack",
    logo: {
      src: "https://langfuse.com/images/integrations/haystack_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "inferable",
    name: "Inferable",
    category: "frameworks",
    description: "Open source observability for Inferable applications.",
    href: "https://langfuse.com/integrations/frameworks/inferable",
    logo: {
      src: "https://langfuse.com/images/integrations/inferable_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "instructor",
    name: "Instructor",
    category: "frameworks",
    description:
      "Open-source observability for Instructor, a popular library to get structured (JSON, Pydantic) LLM outputs.",
    href: "https://langfuse.com/integrations/frameworks/instructor",
    logo: {
      src: "https://langfuse.com/images/integrations/instructor_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "koog",
    name: "Koog",
    category: "frameworks",
    description:
      "Learn how to instrument Koog agents with Langfuse via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/koog",
    logo: {
      src: "https://langfuse.com/images/integrations/koog_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "langchain-deepagents",
    name: "LangChain DeepAgents",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with LangChain DeepAgents for enhanced observability and tracing",
    href: "https://langfuse.com/integrations/frameworks/langchain-deepagents",
    logo: {
      src: "https://langfuse.com/images/integrations/langchain_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "langchain",
    name: "LangChain & LangGraph",
    category: "frameworks",
    description: "Open source LangChain tracing and monitoring.",
    href: "https://langfuse.com/integrations/frameworks/langchain",
    logo: {
      src: "https://langfuse.com/images/integrations/langchain_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "langgraph",
    name: "LangGraph",
    category: "frameworks",
    description:
      "Learn how to use Langfuse for open source observability/tracing in your LangGraph application (Python).",
    href: "https://langfuse.com/integrations/frameworks/langgraph",
    logo: {
      src: "https://langfuse.com/images/integrations/langchain_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "litellm-sdk",
    name: "LiteLLM SDK",
    category: "frameworks",
    description:
      "In this guide, we will show you how to use the LiteLLM SDK to capture LLM calls and log them to Langfuse.",
    href: "https://langfuse.com/integrations/frameworks/litellm-sdk",
    logo: {
      src: "https://langfuse.com/images/integrations/litellm_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "livekit",
    name: "LiveKit",
    category: "frameworks",
    description:
      "Trace real-time voice AI agents and multimodal conversations built with LiveKit Agents using Langfuse.",
    href: "https://langfuse.com/integrations/frameworks/livekit",
    logo: {
      src: "https://langfuse.com/images/integrations/livekit_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "llamaindex-workflows",
    name: "LlamaIndex Workflows",
    category: "frameworks",
    description:
      "Discover how to integrate Langfuse with LlamaIndex for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/frameworks/llamaindex-workflows",
    logo: {
      src: "https://langfuse.com/images/integrations/llamaindex_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "llamaindex",
    name: "LlamaIndex",
    category: "frameworks",
    description:
      "Discover how to integrate Langfuse with LlamaIndex for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/frameworks/llamaindex",
    logo: {
      src: "https://langfuse.com/images/integrations/llamaindex_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "mastra",
    name: "Mastra",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Mastra, a TypeScript agent framework, to monitor, debug, and analyze your AI applications.",
    href: "https://langfuse.com/integrations/frameworks/mastra",
    logo: {
      src: "https://langfuse.com/images/integrations/mastra_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "mcp-use",
    name: "mcp-use",
    category: "frameworks",
    description:
      "Monitor and trace your mcp-use agents and tool executions with Langfuse for comprehensive observability and debugging capabilities.",
    href: "https://langfuse.com/integrations/frameworks/mcp-use",
    logo: {
      src: "https://langfuse.com/images/integrations/mcp-use_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "microsoft-agent-framework",
    name: "Microsoft Agent Framework",
    category: "frameworks",
    description:
      "Learn how to use Langfuse to monitor Microsoft Agent Framework to debug and evaluate your AI agents",
    href: "https://langfuse.com/integrations/frameworks/microsoft-agent-framework",
    logo: {
      src: "https://langfuse.com/images/integrations/microsoft_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "mirascope",
    name: "Mirascope",
    category: "frameworks",
    description: "Open source observability for Mirascope applications.",
    href: "https://langfuse.com/integrations/frameworks/mirascope",
    logo: {
      src: "https://langfuse.com/images/integrations/mirascope_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openai-agents",
    name: "OpenAI Agents",
    category: "frameworks",
    description:
      "Learn how to use Langfuse to monitor OpenAI Agents SDK to debug and evaluate your AI agents",
    href: "https://langfuse.com/integrations/frameworks/openai-agents",
    logo: {
      src: "https://langfuse.com/images/integrations/openai_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "pipecat",
    name: "Pipecat",
    category: "frameworks",
    description:
      "Trace real-time voice and multimodal conversations built with Pipecat using Langfuse.",
    href: "https://langfuse.com/integrations/frameworks/pipecat",
    logo: {
      src: "https://langfuse.com/images/integrations/pipecat_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "pydantic-ai",
    name: "Pydantic AI",
    category: "frameworks",
    description:
      "Discover how to integrate Langfuse with Pydantic AI for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/frameworks/pydantic-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/pydantic_ai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "quarkus-langchain4j",
    name: "Quarkus LangChain4j",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Quarkus LangChain4j using OpenTelemetry for enhanced observability and performance monitoring in your AI applications.",
    href: "https://langfuse.com/integrations/frameworks/quarkus-langchain4j",
    logo: {
      src: "https://langfuse.com/images/integrations/langchain4j_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "ragas",
    name: "Ragas",
    category: "frameworks",
    description:
      "Use Ragas metrics as evaluators in Langfuse experiments: run faithfulness and answer relevancy with run_experiment, and score production RAG traces.",
    href: "https://langfuse.com/integrations/frameworks/ragas",
    logo: {
      src: "https://langfuse.com/images/integrations/ragas_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "restate",
    name: "Restate",
    category: "frameworks",
    description:
      "Learn how to use Langfuse to monitor and evaluate resilient Restate agents and workflows via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/restate",
    logo: {
      src: "https://langfuse.com/images/integrations/restate_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "semantic-kernel",
    name: "Semantic Kernel",
    category: "frameworks",
    description:
      "Discover how to integrate Langfuse with Semantic Kernel for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/frameworks/semantic-kernel",
    logo: {
      src: "https://langfuse.com/images/integrations/microsoft_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "smolagents",
    name: "SmolAgents",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Hugging Face smolagents using OpenTelemetry.",
    href: "https://langfuse.com/integrations/frameworks/smolagents",
    logo: {
      src: "https://langfuse.com/images/integrations/huggingface_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "spring-ai",
    name: "Spring AI",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Spring AI using OpenTelemetry for enhanced observability and performance monitoring in your AI applications.",
    href: "https://langfuse.com/integrations/frameworks/spring-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/spring_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "strands-agents",
    name: "Strands",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Strands using OpenTelemetry for comprehensive tracing and debugging of your AI agents.",
    href: "https://langfuse.com/integrations/frameworks/strands-agents",
    logo: {
      src: "https://langfuse.com/images/integrations/strands_agents_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "swiftide",
    name: "Swiftide",
    category: "frameworks",
    description:
      "Learn how to use Langfuse to monitor Swiftide applications to debug and evaluate your LLM workflows",
    href: "https://langfuse.com/integrations/frameworks/swiftide",
    logo: {
      src: "https://langfuse.com/images/integrations/swiftide.png",
      appearance: "color",
    },
  },
  {
    slug: "tanstack-ai",
    name: "TanStack AI",
    category: "frameworks",
    description:
      "Learn how to trace TanStack AI applications with Langfuse via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/tanstack-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/tanstack_ai_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "temporal",
    name: "Temporal",
    category: "frameworks",
    description:
      "Learn how to use Langfuse to monitor Temporal workflows and activities via OpenTelemetry",
    href: "https://langfuse.com/integrations/frameworks/temporal",
    logo: {
      src: "https://langfuse.com/images/integrations/temporal_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "vercel-ai-sdk",
    name: "Vercel AI SDK",
    category: "frameworks",
    description:
      "Open source observability for Vercel AI SDK applications with Langfuse - metrics, evaluations, prompt management, playground, datasets.",
    href: "https://langfuse.com/integrations/frameworks/vercel-ai-sdk",
    logo: {
      src: "https://langfuse.com/images/integrations/vercel_ai_sdk_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "voltagent",
    name: "VoltAgent",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with VoltAgent, a TypeScript agent framework, to monitor, debug, and analyze your AI applications.",
    href: "https://langfuse.com/integrations/frameworks/voltagent",
    logo: {
      src: "https://langfuse.com/images/integrations/voltagent_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "watsonx-orchestrate",
    name: "Watsonx Orchestrate ADK",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with IBM watsonx Orchestrate Agent development kit, to monitor, debug, and analyze your AI Agents.",
    href: "https://langfuse.com/integrations/frameworks/watsonx-orchestrate",
    logo: {
      src: "https://langfuse.com/images/integrations/watsonx-orchestrate_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "embabel",
    name: "Embabel",
    category: "frameworks",
    description:
      "Learn how to integrate Langfuse with Embabel Agents using OpenTelemetry for enhanced observability and performance monitoring in your AI agent applications.",
    href: "https://langfuse.com/integrations/frameworks/embabel",
    logo: {
      src: "https://langfuse.com/images/integrations/embabel_icon.jpg",
      appearance: "color",
    },
  },
  {
    slug: "amazon-bedrock-agents",
    name: "Amazon Bedrock Agents",
    category: "model-providers",
    description:
      "This cookbook demonstrates how to trace Amazon Bedrock Agents with Langfuse.",
    href: "https://langfuse.com/integrations/model-providers/amazon-bedrock-agents",
    logo: {
      src: "https://langfuse.com/images/integrations/bedrock_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "amazon-bedrock",
    name: "Amazon Bedrock",
    category: "model-providers",
    description:
      "Open source observability for Amazon Bedrock applications and the Bedrock SDK.",
    href: "https://langfuse.com/integrations/model-providers/amazon-bedrock",
    logo: {
      src: "https://langfuse.com/images/integrations/bedrock_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "anthropic-js",
    name: "Anthropic (JS/TS)",
    category: "model-providers",
    description:
      "Learn how to integrate Langfuse with the Anthropic JS/TS SDK for tracing and debugging of your AI applications.",
    href: "https://langfuse.com/integrations/model-providers/anthropic-js",
    logo: {
      src: "https://langfuse.com/images/integrations/anthropic_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "anthropic",
    name: "Anthropic (Python)",
    category: "model-providers",
    description:
      "Learn how to integrate Langfuse with Anthropic for comprehensive tracing and debugging of your AI conversations.",
    href: "https://langfuse.com/integrations/model-providers/anthropic",
    logo: {
      src: "https://langfuse.com/images/integrations/anthropic_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "baseten",
    name: "Baseten",
    category: "model-providers",
    description:
      "Learn how to integrate Baseten with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/model-providers/baseten",
    logo: {
      src: "https://langfuse.com/images/integrations/baseten_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "byteplus",
    name: "BytePlus",
    category: "model-providers",
    description:
      "Learn how to integrate BytePlus with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/model-providers/byteplus",
    logo: {
      src: "https://langfuse.com/images/integrations/byteplus_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "cerebras",
    name: "Cerebras",
    category: "model-providers",
    description:
      "Learn how to integrate Cerebras with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/model-providers/cerebras",
    logo: {
      src: "https://langfuse.com/images/integrations/cerebras_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "claude-platform",
    name: "Claude Platform",
    category: "model-providers",
    description:
      "Trace Claude Platform Messages API and Managed Agents in Langfuse with native OpenTelemetry export.",
    href: "https://langfuse.com/integrations/model-providers/claude-platform",
    logo: {
      src: "https://langfuse.com/images/integrations/claude_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "cleanlab",
    name: "Cleanlab",
    category: "model-providers",
    description:
      "Automatically evaluate LLMs in real time with Cleanlab's trustworthy Language Model (TLM)",
    href: "https://langfuse.com/integrations/model-providers/cleanlab",
    logo: {
      src: "https://langfuse.com/images/integrations/cleanlab_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "cohere",
    name: "Cohere",
    category: "model-providers",
    description:
      "Guide on integrating Cohere with Langfuse via the OpenAI SDK for observability and debugging.",
    href: "https://langfuse.com/integrations/model-providers/cohere",
    logo: {
      src: "https://langfuse.com/images/integrations/cohere_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "cometapi",
    name: "CometAPI",
    category: "model-providers",
    description:
      "Learn how to integrate CometAPI with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/model-providers/cometapi",
    logo: {
      src: "https://langfuse.com/images/integrations/cometapi_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "databricks",
    name: "Databricks",
    category: "model-providers",
    description:
      "An overview of how Databricks can be used together with Langfuse to develop, test, and evaluate AI applications.",
    href: "https://langfuse.com/integrations/model-providers/databricks",
    logo: {
      src: "https://langfuse.com/images/integrations/databricks_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    category: "model-providers",
    description:
      "Discover how to integrate Langfuse with DeepSeek for enhanced LLM application monitoring, debugging, and tracing.",
    href: "https://langfuse.com/integrations/model-providers/deepseek",
    logo: {
      src: "https://langfuse.com/images/integrations/deepseek_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "fireworks-ai",
    name: "Fireworks AI",
    category: "model-providers",
    description:
      "Guide on using Fireworks AI's open-source and proprietary AI models with Langfuse via the OpenAI SDK.",
    href: "https://langfuse.com/integrations/model-providers/fireworks-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/fireworks_ai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "google-gemini",
    name: "Google Gemini",
    category: "model-providers",
    description:
      "Learn how to integrate Langfuse with the Google GenAI SDK for comprehensive tracing and debugging of your AI conversations.",
    href: "https://langfuse.com/integrations/model-providers/google-gemini",
    logo: {
      src: "https://langfuse.com/images/integrations/google_gemini_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "google-vertex-ai",
    name: "Google Vertex AI",
    category: "model-providers",
    description:
      "Learn how to integrate Langfuse with Google Vertex AI for comprehensive tracing and debugging of your AI conversations.",
    href: "https://langfuse.com/integrations/model-providers/google-vertex-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/vertexai_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "groq",
    name: "Groq",
    category: "model-providers",
    description:
      "Traceability and observability for Groq language models with Langfuse.",
    href: "https://langfuse.com/integrations/model-providers/groq",
    logo: {
      src: "https://langfuse.com/images/integrations/groq_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "huggingface",
    name: "Hugging Face",
    category: "model-providers",
    description:
      "Example notebook on how to monitor Hugging Face models with Langfuse using the OpenAI SDK",
    href: "https://langfuse.com/integrations/model-providers/huggingface",
    logo: {
      src: "https://langfuse.com/images/integrations/huggingface_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "mistral-sdk",
    name: "Mistral",
    category: "model-providers",
    description:
      "Cookbook with examples of the Langfuse Integration for Mistral SDK (Python).",
    href: "https://langfuse.com/integrations/model-providers/mistral-sdk",
    logo: {
      src: "https://langfuse.com/images/integrations/mistral_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "morph",
    name: "Morph",
    category: "model-providers",
    description:
      "Use Morph Reflex classifiers as LLM-as-a-judge evaluators in Langfuse to label your traces with a category in realtime.",
    href: "https://langfuse.com/integrations/model-providers/morph",
    logo: {
      src: "https://langfuse.com/images/integrations/morph_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "novitaai",
    name: "Novita AI",
    category: "model-providers",
    description:
      "Learn how to integrate Novita AI with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/model-providers/novitaai",
    logo: {
      src: "https://langfuse.com/images/integrations/novitaai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "ollama",
    name: "Ollama",
    category: "model-providers",
    description:
      "Run Open Source LLMs locally on your machine with Ollama and trace outputs with Langfuse for Open Source LLM Observability",
    href: "https://langfuse.com/integrations/model-providers/ollama",
    logo: {
      src: "https://langfuse.com/images/integrations/ollama_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "openai-assistants-api",
    name: "OpenAI Assistants API",
    category: "model-providers",
    description:
      "Use of Langfuse decorator to trace calls made to openai assistants",
    href: "https://langfuse.com/integrations/model-providers/openai-assistants-api",
    logo: {
      src: "https://langfuse.com/images/integrations/openai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openai-js",
    name: "OpenAI (JS/TS)",
    category: "model-providers",
    description:
      "Simple wrapper around OpenAI SDK (JS/TS) to get full observability in Langfuse",
    href: "https://langfuse.com/integrations/model-providers/openai-js",
    logo: {
      src: "https://langfuse.com/images/integrations/openai_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "openai-py",
    name: "OpenAI (Python)",
    category: "model-providers",
    description:
      "Drop-in replacement of OpenAI SDK (Python) to get full observability in Langfuse by changing only the import.",
    href: "https://langfuse.com/integrations/model-providers/openai-py",
    logo: {
      src: "https://langfuse.com/images/integrations/openai_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "qwen",
    name: "Qwen",
    category: "model-providers",
    description:
      "Learn how to use Langfuse to monitor and trace your Qwen LLM applications using the OpenAI SDK integration.",
    href: "https://langfuse.com/integrations/model-providers/qwen",
    logo: {
      src: "https://langfuse.com/images/integrations/qwen_icon.png",
      appearance: "light",
    },
  },
  {
    slug: "togetherai",
    name: "Together AI",
    category: "model-providers",
    description:
      "Learn how to integrate Together.ai with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/model-providers/togetherai",
    logo: {
      src: "https://langfuse.com/images/integrations/togetherai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "typesafe",
    name: "TypeSafe (Jev)",
    category: "model-providers",
    description:
      "Trace TypeSafe Jev System One decisions with Langfuse using OpenInference auto-instrumentation.",
    href: "https://langfuse.com/integrations/model-providers/typesafe",
    logo: {
      src: "https://langfuse.com/images/integrations/typesafe_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "typesafe-js",
    name: "TypeSafe (Jev JS/TS)",
    category: "model-providers",
    description:
      "Trace TypeSafe Jev System One calls from the JavaScript SDK with Langfuse by wrapping systemOne in observe() and exporting spans through LangfuseSpanProcessor.",
    href: "https://langfuse.com/integrations/model-providers/typesafe-js",
    logo: {
      src: "https://langfuse.com/images/integrations/typesafe_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "vllm",
    name: "vLLM",
    category: "model-providers",
    description:
      "Learn how to trace vLLM inference with Langfuse using OpenTelemetry for LLM observability.",
    href: "https://langfuse.com/integrations/model-providers/vllm",
    logo: {
      src: "https://langfuse.com/images/integrations/vllm_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "xai-grok",
    name: "xAI Grok",
    category: "model-providers",
    description:
      "Guide on integrating xAI's Grok models with Langfuse for observability.",
    href: "https://langfuse.com/integrations/model-providers/xai-grok",
    logo: {
      src: "https://langfuse.com/images/integrations/xai_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "z-ai",
    name: "Z.ai",
    category: "model-providers",
    description:
      "Guide on using Z.ai's GLM models with Langfuse via the OpenAI SDK to trace, debug, and evaluate your LLM applications.",
    href: "https://langfuse.com/integrations/model-providers/z-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/z-ai_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "anannas",
    name: "Anannas",
    category: "gateways",
    description:
      "Learn how to integrate Langfuse with Anannas AI using the OpenAI SDK.",
    href: "https://langfuse.com/integrations/gateways/anannas",
    logo: {
      src: "https://langfuse.com/images/integrations/anannas_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "azure-api-management",
    name: "Azure API Management",
    category: "gateways",
    description:
      "Expose an OpenTelemetry endpoint through Azure API Management (APIM) and forward OTLP traces to Langfuse, keeping telemetry egress under gateway governance.",
    href: "https://langfuse.com/integrations/gateways/azure-api-management",
    logo: {
      src: "https://langfuse.com/images/integrations/microsoft_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "helicone",
    name: "Helicone",
    category: "gateways",
    description:
      "Learn how to integrate Langfuse with Helicone AI Gateway to access 100+ LLM providers with observability and tracing.",
    href: "https://langfuse.com/integrations/gateways/helicone",
    logo: {
      src: "https://langfuse.com/images/integrations/helicone_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "kong-ai-plugin",
    name: "Kong Gateway",
    category: "gateways",
    description:
      "Learn how to integrate Langfuse with Kong API Gateway for comprehensive AI observability and distributed tracing of LLM applications",
    href: "https://langfuse.com/integrations/gateways/kong-ai-plugin",
    logo: {
      src: "https://langfuse.com/images/integrations/kong-icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "litellm",
    name: "LiteLLM Proxy",
    category: "gateways",
    description: "Open source observability and tracing for LiteLLM Proxy.",
    href: "https://langfuse.com/integrations/gateways/litellm",
    logo: {
      src: "https://langfuse.com/images/integrations/litellm_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    category: "gateways",
    description:
      "Learn how to integrate Langfuse with OpenRouter using Broadcast (no-code) or the OpenAI SDK.",
    href: "https://langfuse.com/integrations/gateways/openrouter",
    logo: {
      src: "https://langfuse.com/images/integrations/openrouter_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "portkey",
    name: "Portkey",
    category: "gateways",
    description:
      "Guide on using Portkey's AI gateway to access 250+ LLM models with Langfuse via the OpenAI SDK.",
    href: "https://langfuse.com/integrations/gateways/portkey",
    logo: {
      src: "https://langfuse.com/images/integrations/portkey_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "truefoundry",
    name: "Truefoundry",
    category: "gateways",
    description:
      "Learn how to integrate Truefoundry with Langfuse using the OpenAI drop-in replacement.",
    href: "https://langfuse.com/integrations/gateways/truefoundry",
    logo: {
      src: "https://langfuse.com/images/integrations/truefoundry-logo.png",
      appearance: "color",
    },
  },
  {
    slug: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    category: "gateways",
    description:
      "Learn how to integrate Langfuse with the Vercel AI Gateway using the OpenAI SDK.",
    href: "https://langfuse.com/integrations/gateways/vercel-ai-gateway",
    logo: {
      src: "https://langfuse.com/images/integrations/vercel_ai_gateway_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "dify",
    name: "Dify",
    category: "no-code",
    description:
      "Open source observability and prompt management for Dify applications.",
    href: "https://langfuse.com/integrations/no-code/dify",
    logo: {
      src: "https://langfuse.com/images/integrations/dify_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "elevenlabs",
    name: "ElevenLabs",
    category: "no-code",
    description:
      "Forward OpenTelemetry traces from ElevenLabs Agents conversations to Langfuse to monitor transcripts, tool calls, RAG retrievals, token usage, and cost.",
    href: "https://langfuse.com/integrations/no-code/elevenlabs",
    logo: {
      src: "https://langfuse.com/images/integrations/elevenlabs_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "flowise",
    name: "Flowise",
    category: "no-code",
    description:
      "Monitor and trace your Flowise LLM applications with Langfuse.",
    href: "https://langfuse.com/integrations/no-code/flowise",
    logo: {
      src: "https://langfuse.com/images/integrations/flowise_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "goose",
    name: "Codename Goose",
    category: "no-code",
    description:
      "Learn how to integrate Goose, an open-source AI agent, with Langfuse for enhanced monitoring and automation of engineering tasks.",
    href: "https://langfuse.com/integrations/no-code/goose",
    logo: {
      src: "https://langfuse.com/images/integrations/goose_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "hermes",
    name: "Hermes Agent",
    category: "no-code",
    description:
      "Trace and debug Hermes Agent conversations, LLM calls, and tool usage with Langfuse observability.",
    href: "https://langfuse.com/integrations/no-code/hermes",
    logo: {
      src: "https://langfuse.com/images/integrations/hermes_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "langdock",
    name: "Langdock",
    category: "no-code",
    description:
      "Langdock is an enterprise-ready AI platform for creating private agents in minutes—no code required.",
    href: "https://langfuse.com/integrations/no-code/langdock",
    logo: {
      src: "https://langfuse.com/images/integrations/langdock_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "langflow",
    name: "Langflow",
    category: "no-code",
    description:
      "Enhance your Langflow applications with open-source observability and tracing using Langfuse.",
    href: "https://langfuse.com/integrations/no-code/langflow",
    logo: {
      src: "https://langfuse.com/images/integrations/langflow_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "lobechat",
    name: "LobeChat",
    category: "no-code",
    description: "Send LobeChat's existing OpenTelemetry traces to Langfuse.",
    href: "https://langfuse.com/integrations/no-code/lobechat",
    logo: {
      src: "https://langfuse.com/images/integrations/lobechat_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "n8n",
    name: "n8n",
    category: "no-code",
    description:
      "How to trace n8n workflows in Langfuse, giving you observability over the LLM steps you build in the fair-code workflow automation platform.",
    href: "https://langfuse.com/integrations/no-code/n8n",
    logo: {
      src: "https://langfuse.com/images/integrations/n8n_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openclaw",
    name: "OpenClaw",
    category: "no-code",
    description:
      "Trace your OpenClaw AI agent with Langfuse using the OpenClaw x Langfuse plugin for full visibility into prompts, reasoning, tool calls, and costs.",
    href: "https://langfuse.com/integrations/no-code/openclaw",
    logo: {
      src: "https://langfuse.com/images/integrations/openclaw_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openwebui",
    name: "OpenWebUI",
    category: "no-code",
    description:
      "Learn how to integrate Langfuse with OpenWebUI for detailed monitoring and recording of model calls.",
    href: "https://langfuse.com/integrations/no-code/openwebui",
    logo: {
      src: "https://langfuse.com/images/integrations/openwebui_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "ragflow",
    name: "Ragflow",
    category: "no-code",
    description: "Open source observability for Ragflow applications.",
    href: "https://langfuse.com/integrations/no-code/ragflow",
    logo: {
      src: "https://langfuse.com/images/integrations/ragflow_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "vapi",
    name: "Vapi",
    category: "no-code",
    description:
      "Discover how to integrate Vapi with Langfuse for enhanced voice AI telemetry monitoring, enabling improved performance and reliability of your AI applications.",
    href: "https://langfuse.com/integrations/no-code/vapi",
    logo: {
      src: "https://langfuse.com/images/integrations/vapi_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "zapier",
    name: "Zapier",
    category: "no-code",
    description:
      "Automate your LLM engineering workflows by integrating Langfuse with Zapier.",
    href: "https://langfuse.com/integrations/no-code/zapier",
    logo: {
      src: "https://langfuse.com/images/integrations/zapier_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "augment-code",
    name: "Augment Code",
    category: "developer-tools",
    description:
      "Trace Augment Code conversations, tool executions, and final session summaries with Langfuse.",
    href: "https://langfuse.com/integrations/developer-tools/augment-code",
    logo: {
      src: "https://langfuse.com/images/integrations/augment_code_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "claude-code",
    name: "Claude Code",
    category: "developer-tools",
    description:
      "Trace Claude Code AI coding assistant conversations, user inputs, and tool usage with Langfuse for comprehensive observability.",
    href: "https://langfuse.com/integrations/developer-tools/claude-code",
    logo: {
      src: "https://langfuse.com/images/integrations/anthropic_icon.png",
      appearance: "dark",
    },
  },
  {
    slug: "codex",
    name: "Codex",
    category: "developer-tools",
    description:
      "Trace OpenAI Codex CLI coding sessions, agent turns, model calls, system prompts, tool calls, images, token usage, and subagents with Langfuse for comprehensive observability.",
    href: "https://langfuse.com/integrations/developer-tools/codex",
    logo: {
      src: "https://langfuse.com/images/integrations/openai_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "cursor",
    name: "Cursor",
    category: "developer-tools",
    description:
      "Trace Cursor agent sessions in Langfuse, including prompts, tool calls, subagents, and token usage.",
    href: "https://langfuse.com/integrations/developer-tools/cursor",
    logo: {
      src: "https://langfuse.com/images/integrations/cursor_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "github-copilot",
    name: "GitHub Copilot",
    category: "developer-tools",
    description:
      "Trace GitHub Copilot agent sessions in VS Code and the Copilot CLI with Langfuse using Copilot's native OpenTelemetry export — LLM calls, tool executions, and token usage.",
    href: "https://langfuse.com/integrations/developer-tools/github-copilot",
    logo: {
      src: "https://langfuse.com/images/integrations/github_copilot_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "kiro",
    name: "Kiro",
    category: "developer-tools",
    description:
      "Trace Kiro IDE AI agent activity during coding sessions with Langfuse for comprehensive observability of prompts, tool use, file operations, and task execution.",
    href: "https://langfuse.com/integrations/developer-tools/kiro",
    logo: {
      src: "https://langfuse.com/images/integrations/kiro_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "kiro-cli",
    name: "Kiro CLI",
    category: "developer-tools",
    description:
      "Trace Kiro CLI AI agent activity — prompts, tool use, and completions — with Langfuse for comprehensive observability of your terminal coding sessions.",
    href: "https://langfuse.com/integrations/developer-tools/kiro-cli",
    logo: {
      src: "https://langfuse.com/images/integrations/kiro_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "opencode",
    name: "OpenCode",
    category: "developer-tools",
    description:
      "Trace OpenCode coding sessions — user turns, assistant generations, tool calls, retries, and reasoning — with Langfuse for comprehensive observability.",
    href: "https://langfuse.com/integrations/developer-tools/opencode",
    logo: {
      src: "https://langfuse.com/images/integrations/opencode_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "pi-agent",
    name: "Pi Agent",
    category: "developer-tools",
    description:
      "Trace Pi coding agent sessions with Langfuse — agent turns, model generations, token usage with cache and reasoning splits, cost, tool calls, and nested subagents.",
    href: "https://langfuse.com/integrations/developer-tools/pi-agent",
    logo: {
      src: "https://langfuse.com/images/integrations/pi-agent_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "vscode",
    name: "VS Code",
    category: "developer-tools",
    description:
      "Connect the Langfuse MCP server to VS Code to query and manage your prompts, traces, and datasets from GitHub Copilot agent mode.",
    href: "https://langfuse.com/integrations/developer-tools/vscode",
    logo: {
      src: "https://langfuse.com/images/integrations/vscode_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "cognee",
    name: "Cognee",
    category: "other",
    description:
      "Monitor Cognee pipelines and AI memory with Langfuse for comprehensive observability in your AI agents.",
    href: "https://langfuse.com/integrations/other/cognee",
    logo: {
      src: "https://langfuse.com/images/integrations/cognee_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "everos",
    name: "EverOS",
    category: "other",
    description:
      "Observe your AI agent's memory layer — writes, LLM extraction, recall with quality scores, and reflection — in Langfuse over OpenTelemetry.",
    href: "https://langfuse.com/integrations/other/everos",
    logo: {
      src: "https://langfuse.com/images/integrations/everos_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "exa",
    name: "Exa",
    category: "other",
    description:
      "Learn how to trace Exa AI search operations using Langfuse to capture detailed observability data for your search queries and API calls.",
    href: "https://langfuse.com/integrations/other/exa",
    logo: {
      src: "https://langfuse.com/images/integrations/exa_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    category: "other",
    description:
      "Learn how to trace Firecrawl operations using Langfuse to capture detailed observability data for your web scraping tasks.",
    href: "https://langfuse.com/integrations/other/firecrawl",
    logo: {
      src: "https://langfuse.com/images/integrations/firecrawl_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "gradio",
    name: "Gradio",
    category: "other",
    description:
      "Build an LLM Chat UI with 🤗 Gradio and trace it with 🪢 Langfuse.",
    href: "https://langfuse.com/integrations/other/gradio",
    logo: {
      src: "https://langfuse.com/images/integrations/gradio_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "milvus",
    name: "Milvus",
    category: "other",
    description:
      "Integrate Langfuse with Milvus for efficient AI monitoring and vector storage using the LlamaIndex integration.",
    href: "https://langfuse.com/integrations/other/milvus",
    logo: {
      src: "https://langfuse.com/images/integrations/milvus_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "mlflow",
    name: "MLflow",
    category: "other",
    description:
      "Example cookbook for the MLflow Langfuse integration using OpenTelemetry.",
    href: "https://langfuse.com/integrations/other/mlflow",
    logo: {
      src: "https://langfuse.com/images/integrations/opentelemetry_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openinference",
    name: "OpenInference (Arize)",
    category: "other",
    description:
      "Example cookbook on using the OpenInference SDK by Arize to trace your application to Langfuse.",
    href: "https://langfuse.com/integrations/other/openinference",
    logo: {
      src: "https://langfuse.com/images/integrations/opentelemetry_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openlit",
    name: "OpenLIT",
    category: "other",
    description:
      "Example cookbook for the OpenLIT Langfuse integration using OpenTelemetry.",
    href: "https://langfuse.com/integrations/other/openlit",
    logo: {
      src: "https://langfuse.com/images/integrations/opentelemetry_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "openllmetry",
    name: "OpenLLMetry",
    category: "other",
    description:
      "Example cookbook for the OpenLLMetry Langfuse integration using OpenTelemetry.",
    href: "https://langfuse.com/integrations/other/openllmetry",
    logo: {
      src: "https://langfuse.com/images/integrations/opentelemetry_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "parallel-ai",
    name: "Parallel",
    category: "other",
    description:
      "Learn how to trace Parallel task execution using Langfuse to capture detailed observability data for your AI workflow operations.",
    href: "https://langfuse.com/integrations/other/parallel-ai",
    logo: {
      src: "https://langfuse.com/images/integrations/parallel_icon.svg",
      appearance: "dark",
    },
  },
  {
    slug: "promptfoo",
    name: "Promptfoo",
    category: "other",
    description:
      "Integrate Promptfoo with Langfuse for LLM testing, red teaming, and prompt management.",
    href: "https://langfuse.com/integrations/other/promptfoo",
    logo: {
      src: "https://langfuse.com/images/integrations/promptfoo_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "slack",
    name: "Slack",
    category: "other",
    description:
      "Send Langfuse prompt update and alert notifications to Slack channels.",
    href: "https://langfuse.com/integrations/other/slack",
    logo: {
      src: "https://langfuse.com/images/integrations/slack_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "tavily",
    name: "Tavily",
    category: "other",
    description:
      "Learn how to trace Tavily search and extraction tools in an OpenAI agent with Langfuse.",
    href: "https://langfuse.com/integrations/other/tavily",
    logo: {
      src: "https://langfuse.com/images/integrations/tavily_icon.png",
      appearance: "color",
    },
  },
  {
    slug: "testable-minds",
    name: "Testable Minds",
    category: "other",
    description:
      "Collect human evaluations on your Langfuse traces at scale using Testable Minds' diverse participant pool.",
    href: "https://langfuse.com/integrations/other/testable-minds",
    logo: {
      src: "https://langfuse.com/images/integrations/testable_minds_icon.svg",
      appearance: "color",
    },
  },
  {
    slug: "weco",
    name: "Weco",
    category: "other",
    description:
      "Learn how to integrate Weco with Langfuse to automatically optimize LLM application code using Langfuse datasets and evaluators.",
    href: "https://langfuse.com/integrations/other/weco",
    logo: {
      src: "https://langfuse.com/images/integrations/weco_icon.svg",
      appearance: "color",
    },
  },
];
