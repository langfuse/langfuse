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
  "GPT-4",
  "Claude-3",
  "Gemini",
  "Llama-2",
  "PaLM",
  "CodeLlama",
  "Mistral",
  "Falcon",
  "Vicuna",
];

export const REALISTIC_MODELS = [
  "gpt-4o-mini-2024-07-18",
  "gpt-4-turbo-2024-04-09",
  "claude-3-haiku-20240307",
  "claude-3-sonnet-20240229",
  "claude-3-opus-20240229",
  "gemini-pro",
  "llama-2-70b-chat",
  "mistral-7b-instruct",
  "codellama-34b-instruct",
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
