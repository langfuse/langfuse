// Datasets
const SEED_DATASET_ITEMS_COUNTRIES = [
  { input: { country: "France" }, output: "Paris" },
  { input: { country: "Germany" }, output: "Berlin" },
  { input: { country: "Italy" }, output: "Rome" },
  { input: { country: "Spain" }, output: "Madrid" },
  { input: { country: "United Kingdom" }, output: "London" },
  { input: { country: "Japan" }, output: "Tokyo" },
  { input: { country: "China" }, output: "Beijing" },
  { input: { country: "India" }, output: "New Delhi" },
  { input: { country: "Brazil" }, output: "Brasília" },
  { input: { country: "Canada" }, output: "Ottawa" },
  { input: { country: "Australia" }, output: "Canberra" },
  { input: { country: "South Africa" }, output: "Pretoria" },
  { input: { country: "Mexico" }, output: "Mexico City" },
  { input: { country: "Russia" }, output: "Moscow" },
  { input: { country: "Egypt" }, output: "Cairo" },
  { input: { country: "Turkey" }, output: "Ankara" },
  { input: { country: "Indonesia" }, output: "Jakarta" },
  { input: { country: "South Korea" }, output: "Seoul" },
  { input: { country: "Saudi Arabia" }, output: "Riyadh" },
  { input: { country: "Argentina" }, output: "Buenos Aires" },
  { input: { country: "Nigeria" }, output: "Abuja" },
  { input: { country: "Pakistan" }, output: "Islamabad" },
  { input: { country: "Thailand" }, output: "Bangkok" },
  { input: { country: "Vietnam" }, output: "Hanoi" },
  { input: { country: "Malaysia" }, output: "Kuala Lumpur" },
  { input: { country: "Philippines" }, output: "Manila" },
  { input: { country: "Singapore" }, output: "Singapore" },
  { input: { country: "New Zealand" }, output: "Wellington" },
  { input: { country: "Sweden" }, output: "Stockholm" },
  { input: { country: "Norway" }, output: "Oslo" },
  { input: { country: "Denmark" }, output: "Copenhagen" },
  { input: { country: "Finland" }, output: "Helsinki" },
  { input: { country: "Netherlands" }, output: "Amsterdam" },
  { input: { country: "Belgium" }, output: "Brussels" },
  { input: { country: "Switzerland" }, output: "Bern" },
  { input: { country: "Austria" }, output: "Vienna" },
  { input: { country: "Portugal" }, output: "Lisbon" },
  { input: { country: "Greece" }, output: "Athens" },
  { input: { country: "Poland" }, output: "Warsaw" },
  { input: { country: "Ukraine" }, output: "Kyiv" },
  { input: { country: "Romania" }, output: "Bucharest" },
  { input: { country: "Hungary" }, output: "Budapest" },
  { input: { country: "Czech Republic" }, output: "Prague" },
  { input: { country: "Slovakia" }, output: "Bratislava" },
  { input: { country: "Croatia" }, output: "Zagreb" },
  { input: { country: "Serbia" }, output: "Belgrade" },
  { input: { country: "Bulgaria" }, output: "Sofia" },
  { input: { country: "Ireland" }, output: "Dublin" },
  { input: { country: "Iceland" }, output: "Reykjavik" },
  { input: { country: "Estonia" }, output: "Tallinn" },
  { input: { country: "Latvia" }, output: "Riga" },
  { input: { country: "Lithuania" }, output: "Vilnius" },
];

const SEED_DATASET_ITEMS_IPA = [
  { input: { word: "the" }, output: "/ðə/" },
  { input: { word: "be" }, output: "/bi/" },
  { input: { word: "to" }, output: "/tu/" },
  { input: { word: "of" }, output: "/əv/" },
  { input: { word: "and" }, output: "/ænd/" },
  { input: { word: "a" }, output: "/ə/" },
  { input: { word: "in" }, output: "/ɪn/" },
  { input: { word: "that" }, output: "/ðæt/" },
  { input: { word: "have" }, output: "/hæv/" },
  { input: { word: "I" }, output: "/aɪ/" },
  { input: { word: "it" }, output: "/ɪt/" },
  { input: { word: "for" }, output: "/fɔr/" },
  { input: { word: "not" }, output: "/nɑt/" },
  { input: { word: "on" }, output: "/ɑn/" },
  { input: { word: "with" }, output: "/wɪð/" },
  { input: { word: "he" }, output: "/hi/" },
  { input: { word: "as" }, output: "/æz/" },
  { input: { word: "you" }, output: "/ju/" },
  { input: { word: "do" }, output: "/du/" },
  { input: { word: "at" }, output: "/æt/" },
  { input: { word: "this" }, output: "/ðɪs/" },
  { input: { word: "but" }, output: "/bʌt/" },
  { input: { word: "his" }, output: "/hɪz/" },
  { input: { word: "by" }, output: "/baɪ/" },
  { input: { word: "from" }, output: "/frʌm/" },
  { input: { word: "they" }, output: "/ðeɪ/" },
  { input: { word: "we" }, output: "/wi/" },
  { input: { word: "say" }, output: "/seɪ/" },
  { input: { word: "her" }, output: "/hər/" },
  { input: { word: "she" }, output: "/ʃi/" },
  { input: { word: "or" }, output: "/ɔr/" },
  { input: { word: "an" }, output: "/æn/" },
  { input: { word: "will" }, output: "/wɪl/" },
  { input: { word: "my" }, output: "/maɪ/" },
  { input: { word: "one" }, output: "/wʌn/" },
  { input: { word: "all" }, output: "/ɔl/" },
  { input: { word: "would" }, output: "/wʊd/" },
  { input: { word: "there" }, output: "/ðɛr/" },
  { input: { word: "their" }, output: "/ðɛr/" },
  { input: { word: "what" }, output: "/wʌt/" },
  { input: { word: "so" }, output: "/soʊ/" },
  { input: { word: "up" }, output: "/ʌp/" },
  { input: { word: "out" }, output: "/aʊt/" },
  { input: { word: "if" }, output: "/ɪf/" },
  { input: { word: "about" }, output: "/əˈbaʊt/" },
  { input: { word: "who" }, output: "/hu/" },
  { input: { word: "get" }, output: "/gɛt/" },
  { input: { word: "which" }, output: "/wɪtʃ/" },
  { input: { word: "go" }, output: "/goʊ/" },
  { input: { word: "me" }, output: "/mi/" },
  { input: { word: "when" }, output: "/wɛn/" },
  { input: { word: "make" }, output: "/meɪk/" },
  { input: { word: "can" }, output: "/kæn/" },
  { input: { word: "like" }, output: "/laɪk/" },
  { input: { word: "time" }, output: "/taɪm/" },
  { input: { word: "no" }, output: "/noʊ/" },
  { input: { word: "just" }, output: "/dʒʌst/" },
  { input: { word: "him" }, output: "/hɪm/" },
  { input: { word: "know" }, output: "/noʊ/" },
  { input: { word: "take" }, output: "/teɪk/" },
  { input: { word: "person" }, output: "/ˈpərsən/" },
  { input: { word: "into" }, output: "/ˈɪntu/" },
  { input: { word: "year" }, output: "/jɪr/" },
  { input: { word: "your" }, output: "/jʊər/" },
  { input: { word: "good" }, output: "/gʊd/" },
  { input: { word: "some" }, output: "/sʌm/" },
  { input: { word: "could" }, output: "/kʊd/" },
  { input: { word: "them" }, output: "/ðɛm/" },
  { input: { word: "see" }, output: "/si/" },
  { input: { word: "other" }, output: "/ˈʌðər/" },
  { input: { word: "than" }, output: "/ðæn/" },
  { input: { word: "then" }, output: "/ðɛn/" },
  { input: { word: "now" }, output: "/naʊ/" },
  { input: { word: "look" }, output: "/lʊk/" },
  { input: { word: "only" }, output: "/ˈoʊnli/" },
  { input: { word: "come" }, output: "/kʌm/" },
  { input: { word: "its" }, output: "/ɪts/" },
  { input: { word: "over" }, output: "/ˈoʊvər/" },
  { input: { word: "think" }, output: "/θɪŋk/" },
  { input: { word: "also" }, output: "/ˈɔlsoʊ/" },
  { input: { word: "back" }, output: "/bæk/" },
  { input: { word: "after" }, output: "/ˈæftər/" },
  { input: { word: "use" }, output: "/juz/" },
  { input: { word: "two" }, output: "/tu/" },
  { input: { word: "how" }, output: "/haʊ/" },
  { input: { word: "our" }, output: "/aʊər/" },
  { input: { word: "work" }, output: "/wɜrk/" },
  { input: { word: "first" }, output: "/fɜrst/" },
  { input: { word: "well" }, output: "/wɛl/" },
  { input: { word: "way" }, output: "/weɪ/" },
  { input: { word: "even" }, output: "/ˈivɪn/" },
  { input: { word: "new" }, output: "/nu/" },
  { input: { word: "want" }, output: "/wɑnt/" },
  { input: { word: "because" }, output: "/bɪˈkɔz/" },
  { input: { word: "any" }, output: "/ˈɛni/" },
  { input: { word: "these" }, output: "/ðiz/" },
  { input: { word: "give" }, output: "/gɪv/" },
  { input: { word: "day" }, output: "/deɪ/" },
  { input: { word: "most" }, output: "/moʊst/" },
  { input: { word: "us" }, output: "/ʌs/" },
];

const SEED_DATASET_ITEMS_MATH = [
  { input: { equation: "2 + 2" }, output: "4" },
  { input: { equation: "10 - 5" }, output: "5" },
  { input: { equation: "3 * 4" }, output: "12" },
];

const SEED_DATASET_ITEMS_COLORS = [
  { input: { color: "red" }, output: "#FF0000" },
  { input: { color: "blue" }, output: "#0000FF" },
  { input: { color: "green" }, output: "#00FF00" },
];

const SEED_DATASET_ITEMS_SIMPLE = [
  { input: { name: "John" }, output: "John" },
  { input: { name: "Jane" }, output: "Jane" },
  { input: { name: "Jim" }, output: "Jim" },
];

const SEED_DATASET_ITEMS_GREETINGS = [
  { input: { language: "English" }, output: "Hello" },
  { input: { language: "Spanish" }, output: "Hola" },
  { input: { language: "French" }, output: "Bonjour" },
  { input: { language: "German" }, output: "Guten Tag" },
];

const SEED_DATASET_ITEMS_VERSION_TEST = [
  { input: { color: "red" }, output: "#FF0000" },
];

export const SEED_DATASETS = [
  {
    name: "demo-countries-dataset",
    description: "Dataset for countries",
    metadata: {
      key: "value",
    },
    items: SEED_DATASET_ITEMS_COUNTRIES,
    shouldRunExperiment: true,
  },
  {
    name: "demo-english-transcription-dataset",
    description:
      "Dataset for english transcription, where words are represented in their international phonetic alphabet (IPA)",
    metadata: {
      key: "value",
    },
    items: SEED_DATASET_ITEMS_IPA,
    shouldRunExperiment: true,
  },
  {
    name: "folder/math/basic-operations",
    description: "Basic math operations dataset",
    metadata: {
      category: "education",
    },
    items: SEED_DATASET_ITEMS_MATH,
    shouldRunExperiment: false,
  },
  {
    name: "folder/simple-dataset",
    description: "Simple first-level folder dataset",
    metadata: {
      category: "test",
    },
    items: SEED_DATASET_ITEMS_SIMPLE,
    shouldRunExperiment: false,
  },
  {
    name: "folder/design/colors",
    description: "Color name to hex code dataset",
    metadata: {
      category: "design",
    },
    items: SEED_DATASET_ITEMS_COLORS,
    shouldRunExperiment: false,
  },
  {
    name: "folder/customer/greetings",
    description: "Greetings in different languages",
    metadata: {
      category: "i18n",
    },
    items: SEED_DATASET_ITEMS_GREETINGS,
    shouldRunExperiment: false,
  },
  {
    name: "test-dataset-versioning",
    description: "Test dataset with multiple versions of a single item",
    metadata: {
      purpose: "testing dataset versioning feature",
    },
    items: SEED_DATASET_ITEMS_VERSION_TEST,
    shouldRunExperiment: false,
  },
];

// Prompts
export const SEED_TEXT_PROMPTS = [
  {
    id: `prompt-parent`,
    createdBy: "user-1",
    prompt:
      'You are a very enthusiastic Langfuse representative who loves to help people! Langfuse is an open-source observability tool for developers of applications that use Large Language Models (LLMs). Given the following sections from the Langfuse documentation, answer the question using only that information, outputted in markdown format. Refer to the respective links of the documentation.\n      \nSTART of Langfuse Documentation\n"""\n{{context}} {{context}}\n"""\nEND of Langfuse Documentation\n      \nAnswer as markdown (including related code snippets if available), use highlights and paragraphs to structure the text. Use emojis in your answers. Do not mention that you are "enthusiastic", the user does not need to know, will feel it from the style of your answers. Only use information that is available in the context, do not make up any code that is not in the context. If you are unsure and the answer is not explicitly written in the documentation, say "Sorry, I don\'t know how to help with that." If the user is having problems using Langfuse, tell her to reach out to the founders directly via the chat widget. Make it crisp.\n\n@@@langfusePrompt:name=child-prompt|label=production@@@',
    name: "parent-prompt",
    version: 1,
    labels: ["production", "latest"],
  },
  {
    id: `prompt-child`,
    createdBy: "user-1",
    prompt: `Please follow these guidelines:
- Refer to the respective links of the documentation
- Be kind.
- Include emojis where it makes sense.
- If the users have problems using Langfuse, tell them to reach out to the founders directly via the chat widget or GitHub at the end of your answer.
- Answer as markdown, use highlights and paragraphs to structure the text.
- Do not mention that you are "enthusiastic", the user does not need to know, will feel it from the style of your answers.`,
    name: "child-prompt",
    version: 1,
    labels: ["production", "latest"],
  },
  {
    id: `prompt-123`,
    createdBy: "user-1",
    prompt: "Prompt 1 content",
    name: "prompt-1",
    version: 1,
    labels: ["production", "latest"],
  },
  {
    id: `prompt-456`,
    createdBy: "user-1",
    prompt: "Prompt 2 content",
    name: "prompt-2",
    version: 1,
    labels: ["production", "latest"],
  },
  {
    id: `prompt-789`,
    createdBy: "API",
    prompt: "Prompt 3 content",
    name: "prompt-3-by-api",
    version: 1,
    labels: ["production", "latest"],
  },
  {
    id: `prompt-abc`,
    createdBy: "user-1",
    prompt: "Prompt 4 content",
    name: "prompt-4",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
  {
    id: `countries-experiment-prompt`,
    createdBy: "user-1",
    prompt: "What is the capital of {{country}}?",
    name: "countries-experiment-prompt",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
  {
    id: `folder-customer-prompt-1`,
    createdBy: "user-1",
    prompt: "Folder prompt 1 content",
    name: "folder/customer/prompt-1",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
  {
    id: `folder-customer-prompt-2`,
    createdBy: "user-1",
    prompt: "Folder prompt 2 content",
    name: "folder/customer/prompt-2",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
  {
    id: `folder-prompt-1`,
    createdBy: "user-1",
    prompt: "Folder prompt 1 content",
    name: "folder/prompt-1",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
  {
    id: `prompt-with-many-labels`,
    createdBy: "user-1",
    prompt:
      "This is a comprehensive prompt for testing multiple label scenarios. It demonstrates how prompts can be tagged with numerous labels for organization, categorization, and filtering purposes. Use this prompt to understand how label management works at scale. Variables: {{input}}",
    name: "prompt-with-many-labels",
    version: 1,
    labels: [
      "production",
      "latest",
      "v1",
      "v2",
      "stable",
      "beta",
      "alpha",
      "test",
      "development",
      "staging",
      "experimental",
      "feature",
      "bugfix",
      "hotfix",
      "critical",
      "high-priority",
      "medium-priority",
      "low-priority",
      "urgent",
      "customer-facing",
      "internal",
      "public",
      "private",
      "confidential",
      "ai",
      "nlp",
      "chatbot",
      "assistant",
      "automation",
      "ml",
      "data",
      "analytics",
      "monitoring",
      "logging",
      "debug",
      "performance",
      "security",
      "compliance",
      "audit",
      "review",
      "approved",
      "rejected",
      "pending",
      "archived",
      "deprecated",
      "legacy",
      "migration",
      "upgrade",
      "downgrade",
      "template",
      "example",
    ],
    tags: [],
  },
];

export const SEED_CHAT_ML_PROMPTS = [
  {
    id: `prompt-abc`,
    createdBy: "user-1",
    prompt: [
      {
        role: "system",
        content:
          'You are a very enthusiastic Langfuse representative who loves to help people! Langfuse is an open-source observability tool for developers of applications that use Large Language Models (LLMs). Given the following sections from the Langfuse documentation, answer the question using only that information, outputted in markdown format.\n\nPlease follow these guidelines:\n- Refer to the respective links of the documentation and select quality examples\n- Be kind.\n- Include emojis where it makes sense.\n- If the users have problems using Langfuse, tell them to reach out to the founders directly via the chat widget or GitHub at the end of your answer.\n- Answer as markdown, use highlights and paragraphs to structure the text.\n- Do not mention that you are "enthusiastic", the user does not need to know, will feel it from the style of your answers.\n- Only use information that is available in the context, do not make up any code that is not in the context.\n- Always put an empji at the end of the message.',
      },
      {
        role: "assistant",
        content:
          "All right, what is the documentation that I am meant to exclusively use to answer the question?",
      },
      {
        role: "user",
        content: "<documentation>\n```\n{{context}}\n```\n</documentation>",
      },
      {
        role: "assistant",
        content:
          "Answering in next message based on your instructions only. What is the question?",
      },
      {
        role: "user",
        content: "{{question}}",
      },
    ],
    name: "prompt-chat-ml",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
  {
    id: `prompt-chat-placeholder`,
    createdBy: "user-1",
    prompt: [
      {
        role: "system",
        content:
          'You are a very enthusiastic Langfuse representative who loves to help people! Langfuse is an open-source observability tool for developers of applications that use Large Language Models (LLMs). Given the following sections from the Langfuse documentation, answer the question using only that information, outputted in markdown format.\n\nPlease follow these guidelines:\n- Refer to the respective links of the documentation and select quality examples\n- Be kind.\n- Include emojis where it makes sense.\n- If the users have problems using Langfuse, tell them to reach out to the founders directly via the chat widget or GitHub at the end of your answer.\n- Answer as markdown, use highlights and paragraphs to structure the text.\n- Do not mention that you are "enthusiastic", the user does not need to know, will feel it from the style of your answers.\n- Only use information that is available in the context, do not make up any code that is not in the context.\n- Always put an empji at the end of the message.',
      },
      {
        type: "placeholder",
        name: "message_history",
      },
      {
        role: "assistant",
        content:
          "Answering in next message based on your instructions only. What is the question?",
      },
      {
        role: "user",
        content: "{{question}}",
      },
    ],
    name: "prompt-chat-ml-with-placeholder",
    version: 1,
    labels: ["production", "latest"],
    tags: ["tag1", "tag2"],
  },
];

export const SEED_PROMPT_VERSIONS = [
  {
    createdBy: "user-1",
    type: "chat",
    prompt: [
      {
        role: "system",
        content: `## Role
You are a Langfuse filter generator. Your sole function is to parse user queries about AI traces and output the corresponding filter array in JSON format. Map natural language to appropriate column names, operators, and values.

## Available columns and their types:
- bookmarked (boolean): Starred/bookmarked traces
- id (string): Trace ID
- name (stringOptions): Trace name
- environment (stringOptions): Environment (dev, prod, etc.)
- timestamp (datetime): When the trace occurred
- userId (string): User identifier
- sessionId (string): Session identifier
- metadata (stringObject): Custom metadata
- version (string): Version identifier
- release (string): Release identifier
- level (stringOptions): Log level - DEBUG, DEFAULT, WARNING, ERROR
- tags (arrayOptions): Custom tags
- inputTokens (number): Input token count
- outputTokens (number): Output token count
- totalTokens (number): Total token count
- tokens (number): Alias for total tokens
- errorCount (number): Count of error-level observations
- warningCount (number): Count of warning-level observations
- defaultCount (number): Count of default-level observations
- debugCount (number): Count of debug-level observations
- scores_avg (numberObject): Numeric evaluation scores
- score_categories (categoryOptions): Categorical evaluation scores
- latency (number): Latency in seconds
- inputCost (number): Input cost in USD
- outputCost (number): Output cost in USD
- totalCost (number): Total cost in USD

## Type-Operator Compatibility Rules

**string type** - Use for text matching operations:
- Operators: "=", "contains", "does not contain", "starts with", "ends with"
- Value: Always a single string
- Example: {"type": "string", "column": "userId", "operator": "contains", "value": "john"}

**stringOptions type** - Use ONLY for selecting from predefined options:
- Operators: "any of", "none of" ONLY
- Value: Always an array of strings
- Use when filtering columns like name, environment, level with multiple possible values
- Example: {"type": "stringOptions", "column": "environment", "operator": "any of", "value": ["dev", "staging"]}

**arrayOptions type** - Use for tag filtering:
- Operators: "any of", "none of", "all of"
- Value: Always an array of strings
- Example: {"type": "arrayOptions", "column": "tags", "operator": "any of", "value": ["important", "bug"]}

**number type** - Use for numeric comparisons:
- Operators: "=", ">", "<", ">=", "<="
- Value: Always a number
- Example: {"type": "number", "column": "latency", "operator": ">", "value": 2.5}

**datetime type** - Use for time-based filtering:
- Operators: ">", "<", ">=", "<="
- Value: Always a date string
- Example: {"type": "datetime", "column": "timestamp", "operator": ">", "value": "2024-01-01T00:00:00Z"}

**boolean type** - Use for true/false values:
- Operators: "=", "<>"
- Value: Always true or false
- Example: {"type": "boolean", "column": "bookmarked", "operator": "=", "value": true}

**stringObject type** - Use for metadata key-value searches:
- Operators: "=", "contains", "does not contain", "starts with", "ends with"
- Value: Always a string
- Requires "key" field for the metadata key
- Example: {"type": "stringObject", "column": "metadata", "key": "userId", "operator": "=", "value": "123"}

**numberObject type** - Use for numeric score searches:
- Operators: "=", ">", "<", ">=", "<="
- Value: Always a number
- Requires "key" field for the score name
- Example: {"type": "numberObject", "column": "scores_avg", "key": "quality", "operator": ">", "value": 0.8}

## Output Format

Please respond ONLY with valid JSON. Do not include any explanation or extra text.
The response should look like this without the leading EOF and trailing EOF.

EOF
{
  "filters": [
    {
      "type": "stringOptions|number|string|categoryOptions",
      "value": "value or array",
      "column": "exact column name",
      "operator": "= | > | < | any of"
    }
  ]
}
EOF

## Intent Parsing Guidelines

**Temporal expressions:**
- "today", "yesterday", "last week" → timestamp filters
- "after 2pm", "before noon", "since Monday" → timestamp with appropriate operators
- Relative times: "last 24 hours", "past 3 days" → calculate from current time

**Performance queries:**
- "slow", "high latency", "taking too long" → latency > threshold
- "expensive", "costly", "high cost" → totalCost > threshold
- "many tokens", "token heavy" → totalTokens > threshold
- "cheap", "fast", "quick" → use < operators

**Error/Quality queries:**
- "errors", "failed", "broken" → level = ERROR or errorCount > 0
- "warnings" → level = WARNING or warningCount > 0
- "successful", "working" → level = DEFAULT or errorCount = 0

**User/Session queries:**
- "user john", "by user", "user ID" → userId filters
- "session abc", "in session" → sessionId filters

**Environment queries:**
- "prod", "production" → environment = production
- "dev", "development", "staging" → environment matching
- "live", "deployed" → typically production environment

**Metadata/Tags:**
- "tagged with", "has tag" → tags contains
- "metadata contains", "custom field" → metadata object queries

**Comparison operators:**
- "more than", "over", "above", "greater" → >
- "less than", "under", "below", "fewer" → <
- "at least", "minimum" → >=
- "at most", "maximum" → <=
- "exactly", "equal to" → =
- "not", "except", "excluding" → not_equals or not_contains

**Text search operations:**
- "contains", "includes", "has" → use "string" type with "contains" operator
- "equals", "is exactly" → use "string" type with "=" operator
- "starts with", "begins with" → use "string" type with "starts with" operator

**Multi-option selections:**
- "environment is dev or staging" → use "stringOptions" type with "any of" operator
- "name is one of X, Y, Z" → use "stringOptions" type with "any of" operator
- "level is ERROR or WARNING" → use "stringOptions" type with "any of" operator

## Current DateTime

This is the current datetime: {{currentDatetime}}
Use it as a reference for datetime based queries when needed.

## Examples

Input: "I want to see all dev traces"
Output: {"filters":[{"type":"stringOptions","value":["development","dev"],"column":"environment","operator":"any of"}]}

Input: "Show traces with version starting with v2"
Output: {"filters":[{"type":"string","value":"v2","column":"version","operator":"starts with"}]}`,
      },
      {
        role: "user",
        content: "{{userPrompt}}",
      },
    ],
    name: "get-filter-conditions-from-query",
    version: 1,
    labels: ["production", "latest"],
  },
  {
    createdBy: "user-1",
    prompt: "Prompt 4 version 1 content with {{variable}}",
    name: "prompt-4-with-variable-and-config",
    config: {
      temperature: 0.7,
    },
    version: 1,
  },
  {
    createdBy: "user-1",
    prompt: "Prompt 4 version 2 content with {{variable}}",
    name: "prompt-4-with-variable-and-config",
    config: {
      temperature: 0.7,
      topP: 0.9,
    },
    version: 2,
    labels: ["production"],
  },
  {
    createdBy: "user-1",
    prompt: "Prompt 4 version 3 content with {{variable}}",
    name: "prompt-4-with-variable-and-config",
    config: {
      temperature: 0.7,
      topP: 0.9,
      frequencyPenalty: 0.5,
    },
    version: 3,
    labels: ["production", "latest"],
  },
];

// evaluators
export const SEED_EVALUATOR_TEMPLATES = [
  {
    id: "toxicity-template",
    name: "toxicity-template",
    version: 1,
    prompt:
      "Please evaluate the toxicity of the following text {{input}} {{output}}",
    model: "gpt-3.5-turbo",
    vars: ["input", "output"],
    provider: "openai",
    outputSchema: {
      score: "provide a score between 0 and 1",
      reasoning: "one sentence reasoning for the score",
    },
    modelParams: {
      temperature: 0.7,
      outputTokenLimit: 100,
      topP: 0.9,
    },
  },
];

export const SEED_EVALUATOR_CONFIGS = [
  {
    id: "toxicity-job",
    evalTemplateId: "toxicity-template",
    jobType: "EVAL",
    status: "ACTIVE",
    scoreName: "toxicity",
    filter: [
      {
        type: "string",
        value: "user",
        column: "User ID",
        operator: "contains",
      },
    ],
    variableMapping: [
      {
        langfuseObject: "trace",
        selectedColumnId: "input",
        templateVariable: "input",
      },
      {
        langfuseObject: "trace",
        selectedColumnId: "metadata",
        templateVariable: "output",
      },
    ],
    targetObject: "trace",
    sampling: 1,
    delay: 5_000,
  },
];

export const EVAL_TRACE_COUNT = 100;
export const FAILED_EVAL_TRACE_INTERVAL = 10;
