export const REALISTIC_TRACE_NAMES = [
  "LangGraph",
  "ChatCompletion",
  "DocumentAnalysis",
  "CodeGeneration",
  "DataProcessing",
  "QueryExecution",
  "ModelInference",
  "WebScraping",
  "TextSummarization",
  "ImageClassification",
];

export const REALISTIC_SPAN_NAMES = [
  "agent",
  "tools",
  "search",
  "retrieval",
  "preprocessing",
  "validation",
  "transformation",
  "classification",
  "extraction",
  "postprocessing",
];

export const REALISTIC_GENERATION_NAMES = [
  "ChatOpenAI",
  "GPT-5.4",
  "Claude-Haiku-4.5",
  "Gemini-3.5-Flash",
  "Llama-4",
  "Mixtral-8x22B",
  "Codestral",
  "Mistral-Small",
  "Command-R",
  "Qwen-3",
];

export const REALISTIC_MODELS = [
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gpt-5.6-sol",
  "claude-opus-5",
];

export const REALISTIC_USER_INPUTS = [
  "What is the weather in San Francisco?",
  "Summarize this document for me",
  "Generate a Python function to sort a list",
  "Explain quantum computing in simple terms",
  "Analyze this data and provide insights",
  "Translate this text to Spanish",
  "Create a marketing email for our product",
  "Debug this code and fix the errors",
  "What are the latest trends in AI?",
  "Help me plan a trip to Europe",
];

export const REALISTIC_AI_RESPONSES = [
  "The current weather in San Francisco is 60 degrees and foggy.",
  "Here's a summary of the key points from the document...",
  "Here's a Python function that sorts a list efficiently...",
  "Quantum computing uses quantum mechanics principles...",
  "Based on the data analysis, I found the following insights...",
  "Here's the Spanish translation of your text...",
  "I've created a compelling marketing email for your product...",
  "I found several issues in your code and here are the fixes...",
  "The latest AI trends include large language models...",
  "Here's a detailed 10-day European itinerary for you...",
];

export const REALISTIC_METADATA_EXAMPLES = [
  { thread_id: 42, session_type: "interactive" },
  { user_id: "user_123", conversation_id: "conv_456" },
  { model_version: "v2.1", temperature: 0.7 },
  { request_id: "req_789", timestamp: "2024-05-23T15:42:11.996Z" },
  { environment: "production", region: "us-west-2" },
  {
    document_type: "state_of_union",
    file_size: "142KB",
    processing_time: "2.3s",
  },
  { data_source: "product_catalog", record_count: 30, format: "nested_json" },
  { analysis_type: "sentiment", language: "en", confidence: 0.92 },
  {
    extraction_task: "policy_analysis",
    domain: "politics",
    entities_found: 15,
  },
  { file_type: "JSON", validation: "passed", schema_version: "v1.2" },
];

export const REALISTIC_AGENT_NAMES = [
  "AI-Coordinator",
  "TaskManager",
  "WorkflowOrchestrator",
  "PlanningAgent",
  "MultiStepAgent",
  "SmartCoordinator",
];

export const REALISTIC_TOOL_NAMES = [
  "WebSearchTool",
  "CalculatorTool",
  "WeatherForecastTool",
  "EmailSenderTool",
];

export const REALISTIC_CHAIN_NAMES = [
  "DataTransformationChain",
  "ProcessingPipeline",
  "TransformationChain",
  "MultiStepProcess",
];

export const REALISTIC_RETRIEVER_NAMES = [
  "DocumentRetriever",
  "SemanticSearch",
  "InformationRetriever",
  "VectorSearch",
  "MemoryRetriever",
];

export const REALISTIC_EVALUATOR_NAMES = [
  "QualityEvaluator",
  "RelevanceScorer",
  "AccuracyChecker",
  "ResponseEvaluator",
  "ContentScorer",
];

export const REALISTIC_EMBEDDING_NAMES = [
  "TextEmbedding",
  "DocumentEncoder",
  "SemanticEncoder",
  "VectorEmbedding",
];

export const REALISTIC_GUARDRAIL_NAMES = [
  "SafetyChecker",
  "ContentModerator",
  "ToxicityFilter",
  "JailbreakDetector",
  "PolicyEnforcer",
];
