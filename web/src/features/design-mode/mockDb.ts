import { type Session } from "next-auth";

export const DESIGN_MODE_PRIMARY_ORG_ID = "org_langofuso";
export const DESIGN_MODE_PRIMARY_PROJECT_ID = "test";

export const designModeOrganizations = [
  {
    id: "org_langofuso",
    name: "langofuso",
    role: "OWNER",
    cloudConfig: undefined,
    plan: "cloud:pro",
    metadata: {
      source: "design-mode",
      mocked: true,
      region: "eu-central",
    },
    aiFeaturesEnabled: true,
    projects: [
      {
        id: "test",
        name: "langfuse-redesign",
        deletedAt: null,
        retentionDays: 30,
        hasTraces: true,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "production",
        },
        role: "OWNER",
      },
      {
        id: "prompt-studio",
        name: "Prompt Studio",
        deletedAt: null,
        retentionDays: 30,
        hasTraces: true,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "staging",
        },
        role: "OWNER",
      },
      {
        id: "eval-lab",
        name: "Evaluation Lab",
        deletedAt: null,
        retentionDays: 14,
        hasTraces: true,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "development",
        },
        role: "OWNER",
      },
      {
        id: "launchpad",
        name: "Launchpad",
        deletedAt: null,
        retentionDays: 7,
        hasTraces: false,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "preview",
        },
        role: "OWNER",
      },
    ],
  },
  {
    id: "org_signal_stack",
    name: "Signal Stack",
    role: "OWNER",
    cloudConfig: undefined,
    plan: "cloud:team",
    metadata: {
      source: "design-mode",
      mocked: true,
      region: "us-east",
    },
    aiFeaturesEnabled: true,
    projects: [
      {
        id: "support-copilot",
        name: "Support Copilot",
        deletedAt: null,
        retentionDays: 30,
        hasTraces: true,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "production",
        },
        role: "OWNER",
      },
      {
        id: "revenue-ops",
        name: "Revenue Ops",
        deletedAt: null,
        retentionDays: 30,
        hasTraces: true,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "staging",
        },
        role: "OWNER",
      },
    ],
  },
  {
    id: "org_heliograph",
    name: "Heliograph AI",
    role: "OWNER",
    cloudConfig: undefined,
    plan: "cloud:hobby",
    metadata: {
      source: "design-mode",
      mocked: true,
      region: "eu-west",
    },
    aiFeaturesEnabled: true,
    projects: [
      {
        id: "meeting-memory",
        name: "Meeting Memory",
        deletedAt: null,
        retentionDays: 14,
        hasTraces: true,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "production",
        },
        role: "OWNER",
      },
      {
        id: "knowledge-search",
        name: "Knowledge Search",
        deletedAt: null,
        retentionDays: 14,
        hasTraces: false,
        metadata: {
          source: "design-mode",
          mocked: true,
          environment: "preview",
        },
        role: "OWNER",
      },
    ],
  },
] as const satisfies Session["user"]["organizations"];

export const designModeProjects = designModeOrganizations.flatMap(
  (organization) =>
    organization.projects.map((project) => ({
      ...project,
      organizationId: organization.id,
      organizationName: organization.name,
    })),
);

export const designModeUsers = [
  {
    id: "user_evren",
    name: "Evren Dombak",
    email: "evren@langfuse.local",
    team: "Design Engineering",
    role: "Owner",
    lastActive: "2 min ago",
    traces: 128,
    prompts: 19,
    scores: 34,
  },
  {
    id: "user_zoe",
    name: "Zoe Martin",
    email: "zoe@langfuse.local",
    team: "ML Platform",
    role: "Maintainer",
    lastActive: "6 min ago",
    traces: 96,
    prompts: 14,
    scores: 27,
  },
  {
    id: "user_liam",
    name: "Liam Chen",
    email: "liam@langfuse.local",
    team: "Engineering",
    role: "Maintainer",
    lastActive: "18 min ago",
    traces: 84,
    prompts: 11,
    scores: 21,
  },
  {
    id: "user_nora",
    name: "Nora Patel",
    email: "nora@langfuse.local",
    team: "Customer Ops",
    role: "Member",
    lastActive: "27 min ago",
    traces: 53,
    prompts: 8,
    scores: 18,
  },
  {
    id: "user_daniel",
    name: "Daniel Kim",
    email: "daniel@langfuse.local",
    team: "Growth",
    role: "Member",
    lastActive: "43 min ago",
    traces: 41,
    prompts: 7,
    scores: 13,
  },
  {
    id: "user_priya",
    name: "Priya Singh",
    email: "priya@langfuse.local",
    team: "Research",
    role: "Member",
    lastActive: "58 min ago",
    traces: 38,
    prompts: 9,
    scores: 17,
  },
] as const;

export const designModeTraces = [
  {
    id: "trace_support_answer",
    name: "Support answer generation",
    projectId: "test",
    user: "Evren Dombak",
    model: "gpt-4.1",
    environment: "production",
    score: "0.96",
    latency: "1.1s",
    timestamp: "3 min ago",
  },
  {
    id: "trace_onboarding_summary",
    name: "Onboarding summary draft",
    projectId: "test",
    user: "Zoe Martin",
    model: "claude-3.7-sonnet",
    environment: "staging",
    score: "0.91",
    latency: "1.8s",
    timestamp: "8 min ago",
  },
  {
    id: "trace_redesign_brief",
    name: "Redesign brief synthesis",
    projectId: "test",
    user: "Evren Dombak",
    model: "o3-mini",
    environment: "production",
    score: "0.93",
    latency: "2.4s",
    timestamp: "15 min ago",
  },
  {
    id: "trace_prompt_refiner",
    name: "Prompt refiner loop",
    projectId: "prompt-studio",
    user: "Liam Chen",
    model: "gpt-4o",
    environment: "staging",
    score: "0.89",
    latency: "1.6s",
    timestamp: "21 min ago",
  },
  {
    id: "trace_label_classifier",
    name: "Ticket label classifier",
    projectId: "support-copilot",
    user: "Nora Patel",
    model: "claude-3.5-haiku",
    environment: "production",
    score: "0.94",
    latency: "760ms",
    timestamp: "28 min ago",
  },
  {
    id: "trace_contact_scoring",
    name: "Lead scoring batch",
    projectId: "revenue-ops",
    user: "Daniel Kim",
    model: "gemini-2.5-pro",
    environment: "production",
    score: "0.87",
    latency: "3.4s",
    timestamp: "34 min ago",
  },
  {
    id: "trace_judge_recall",
    name: "Judge recall regression",
    projectId: "eval-lab",
    user: "Priya Singh",
    model: "gpt-4.1-mini",
    environment: "development",
    score: "0.84",
    latency: "2.1s",
    timestamp: "39 min ago",
  },
  {
    id: "trace_answer_grounding",
    name: "Grounding verifier",
    projectId: "eval-lab",
    user: "Zoe Martin",
    model: "claude-3.7-sonnet",
    environment: "development",
    score: "0.9",
    latency: "1.5s",
    timestamp: "45 min ago",
  },
  {
    id: "trace_meeting_extract",
    name: "Meeting action extraction",
    projectId: "meeting-memory",
    user: "Priya Singh",
    model: "gpt-4o-mini",
    environment: "production",
    score: "0.92",
    latency: "980ms",
    timestamp: "53 min ago",
  },
  {
    id: "trace_note_cleanup",
    name: "Transcript cleanup pass",
    projectId: "meeting-memory",
    user: "Liam Chen",
    model: "gemini-2.0-flash",
    environment: "staging",
    score: "0.86",
    latency: "1.3s",
    timestamp: "1 hr ago",
  },
  {
    id: "trace_launch_copy",
    name: "Launch messaging draft",
    projectId: "launchpad",
    user: "Daniel Kim",
    model: "gpt-4.1",
    environment: "preview",
    score: "0.82",
    latency: "1.9s",
    timestamp: "1 hr ago",
  },
  {
    id: "trace_knowledge_router",
    name: "Knowledge router probe",
    projectId: "knowledge-search",
    user: "Evren Dombak",
    model: "claude-3.5-haiku",
    environment: "preview",
    score: "0.88",
    latency: "820ms",
    timestamp: "2 hrs ago",
  },
] as const;

export const designModeSessions = [
  {
    id: "session_checkout_assistant",
    name: "Checkout assistant QA",
    projectId: "test",
    user: "Evren Dombak",
    traceCount: 18,
    status: "Active",
    lastSeen: "just now",
  },
  {
    id: "session_release_readiness",
    name: "Release readiness review",
    projectId: "test",
    user: "Zoe Martin",
    traceCount: 12,
    status: "Watching",
    lastSeen: "9 min ago",
  },
  {
    id: "session_prompt_workbench",
    name: "Prompt workbench",
    projectId: "prompt-studio",
    user: "Liam Chen",
    traceCount: 16,
    status: "Active",
    lastSeen: "16 min ago",
  },
  {
    id: "session_support_triage",
    name: "Support triage",
    projectId: "support-copilot",
    user: "Nora Patel",
    traceCount: 11,
    status: "Active",
    lastSeen: "24 min ago",
  },
  {
    id: "session_eval_sprint",
    name: "Eval sprint",
    projectId: "eval-lab",
    user: "Priya Singh",
    traceCount: 9,
    status: "Idle",
    lastSeen: "39 min ago",
  },
  {
    id: "session_revenue_sync",
    name: "Revenue ops sync",
    projectId: "revenue-ops",
    user: "Daniel Kim",
    traceCount: 7,
    status: "Watching",
    lastSeen: "52 min ago",
  },
] as const;

export const designModePrompts = [
  {
    id: "prompt_support_answer_v4",
    name: "support-answer",
    version: "v4",
    label: "production",
    labels: ["production"],
    tags: ["support", "customer"],
    type: "chat",
    prompt:
      "You are a helpful support copilot. Answer clearly and cite the source article IDs.",
    model: "gpt-4.1",
    updatedAt: "5 min ago",
    projectId: "test",
  },
  {
    id: "prompt_support_answer_v5",
    name: "support-answer",
    version: "v5",
    label: "candidate",
    labels: ["candidate"],
    tags: ["support", "rewrite"],
    type: "chat",
    prompt:
      "Draft a concise support response, then include optional escalation guidance.",
    model: "gpt-4.1",
    updatedAt: "11 min ago",
    projectId: "test",
  },
  {
    id: "prompt_redesign_brief_v2",
    name: "redesign-brief",
    version: "v2",
    label: "staging",
    labels: ["staging"],
    tags: ["design", "brief"],
    type: "text",
    prompt:
      "Summarize the redesign brief into a structured narrative with constraints and opportunities.",
    model: "claude-3.7-sonnet",
    updatedAt: "22 min ago",
    projectId: "prompt-studio",
  },
  {
    id: "prompt_lead_qualifier_v3",
    name: "lead-qualifier",
    version: "v3",
    label: "production",
    labels: ["production"],
    tags: ["growth", "sales"],
    type: "chat",
    prompt:
      "Score this lead based on intent, fit, and urgency. Explain the confidence level.",
    model: "gemini-2.5-pro",
    updatedAt: "29 min ago",
    projectId: "revenue-ops",
  },
  {
    id: "prompt_judge_output_v2",
    name: "judge-output",
    version: "v2",
    label: "development",
    labels: ["development"],
    tags: ["evals", "judge"],
    type: "text",
    prompt:
      "Return a numeric score and concise reasoning for the evaluated trace output.",
    model: "gpt-4.1-mini",
    updatedAt: "35 min ago",
    projectId: "eval-lab",
  },
  {
    id: "prompt_meeting_digest_v6",
    name: "meeting-digest",
    version: "v6",
    label: "production",
    labels: ["production"],
    tags: ["meetings", "summary"],
    type: "chat",
    prompt:
      "Turn this meeting transcript into a summary, decisions, and next actions.",
    model: "gpt-4o-mini",
    updatedAt: "48 min ago",
    projectId: "meeting-memory",
  },
  {
    id: "prompt_launch_copy_v1",
    name: "launch-copy",
    version: "v1",
    label: "preview",
    labels: ["preview"],
    tags: ["launch", "marketing"],
    type: "text",
    prompt:
      "Draft launch messaging for the new feature with a confident but grounded tone.",
    model: "claude-3.5-haiku",
    updatedAt: "1 hr ago",
    projectId: "launchpad",
  },
] as const;

export const designModeScores = [
  {
    id: "score_helpfulness",
    projectId: "test",
    traceId: "trace_support_answer",
    name: "Helpfulness",
    value: "0.96",
    dataType: "NUMERIC",
    source: "API",
    traceName: "Support answer generation",
    comment: "Answer resolved the customer issue without escalation.",
    reviewer: "LLM judge",
    updatedAt: "3 min ago",
  },
  {
    id: "score_groundedness",
    projectId: "test",
    traceId: "trace_redesign_brief",
    name: "Groundedness",
    value: "0.93",
    dataType: "NUMERIC",
    source: "ANNOTATION",
    traceName: "Redesign brief synthesis",
    comment: "Matches the source document structure closely.",
    reviewer: "Zoe Martin",
    updatedAt: "15 min ago",
  },
  {
    id: "score_resolution",
    projectId: "support-copilot",
    traceId: "trace_label_classifier",
    name: "Resolution quality",
    value: "0.94",
    dataType: "NUMERIC",
    source: "ANNOTATION",
    traceName: "Ticket label classifier",
    comment: "Strong escalation routing and confidence language.",
    reviewer: "Nora Patel",
    updatedAt: "28 min ago",
  },
  {
    id: "score_conversion",
    projectId: "revenue-ops",
    traceId: "trace_contact_scoring",
    name: "Conversion confidence",
    value: "0.87",
    dataType: "NUMERIC",
    source: "API",
    traceName: "Lead scoring batch",
    comment: "A little conservative on mid-market leads.",
    reviewer: "LLM judge",
    updatedAt: "34 min ago",
  },
  {
    id: "score_recall",
    projectId: "eval-lab",
    traceId: "trace_judge_recall",
    name: "Recall",
    value: "0.84",
    dataType: "NUMERIC",
    source: "ANNOTATION",
    traceName: "Judge recall regression",
    comment: "Needs broader retrieval coverage for long-tail prompts.",
    reviewer: "Priya Singh",
    updatedAt: "39 min ago",
  },
  {
    id: "score_clarity",
    projectId: "meeting-memory",
    traceId: "trace_meeting_extract",
    name: "Clarity",
    value: "0.91",
    dataType: "NUMERIC",
    source: "ANNOTATION",
    traceName: "Meeting action extraction",
    comment: "Very readable summary and action item formatting.",
    reviewer: "Evren Dombak",
    updatedAt: "53 min ago",
  },
  {
    id: "score_tone",
    projectId: "launchpad",
    traceId: "trace_launch_copy",
    name: "Tone",
    value: "0.88",
    dataType: "NUMERIC",
    source: "ANNOTATION",
    traceName: "Launch messaging draft",
    comment: "Needs slightly stronger product confidence.",
    reviewer: "Daniel Kim",
    updatedAt: "1 hr ago",
  },
] as const;

export const designModeDatasets = [
  {
    id: "dataset_support_goldens",
    projectId: "test",
    name: "Support Goldens",
    description: "High-signal support conversations with ideal completions.",
    metadata: {
      owner: "Support Engineering",
      locale: "en-US",
      tier: "gold",
    },
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        accountTier: { type: "string" },
      },
      required: ["question"],
    },
    expectedOutputSchema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        citations: { type: "array", items: { type: "string" } },
      },
      required: ["answer"],
    },
    itemCount: 48,
    evalCount: 6,
    updatedAt: "1 hr ago",
  },
  {
    id: "dataset_redesign_copy",
    projectId: "prompt-studio",
    name: "Redesign Copy Review",
    description: "Homepage and onboarding copy variants for design reviews.",
    metadata: {
      owner: "Design Engineering",
      locale: "en-US",
      tier: "silver",
    },
    inputSchema: {
      type: "object",
      properties: {
        screen: { type: "string" },
        brief: { type: "string" },
      },
      required: ["screen", "brief"],
    },
    expectedOutputSchema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        body: { type: "string" },
      },
      required: ["headline"],
    },
    itemCount: 31,
    evalCount: 4,
    updatedAt: "2 hrs ago",
  },
  {
    id: "dataset_checkout_qa",
    projectId: "launchpad",
    name: "Checkout QA",
    description: "Edge cases for cart state, coupons, and checkout blockers.",
    metadata: {
      owner: "Growth",
      locale: "en-US",
      tier: "silver",
    },
    inputSchema: {
      type: "object",
      properties: {
        cartState: { type: "string" },
        issue: { type: "string" },
      },
      required: ["cartState", "issue"],
    },
    expectedOutputSchema: {
      type: "object",
      properties: {
        resolution: { type: "string" },
      },
      required: ["resolution"],
    },
    itemCount: 24,
    evalCount: 3,
    updatedAt: "3 hrs ago",
  },
  {
    id: "dataset_meeting_notes",
    projectId: "meeting-memory",
    name: "Meeting Notes Goldens",
    description:
      "Meeting transcripts and expected summaries with action items.",
    metadata: {
      owner: "Research",
      locale: "en-US",
      tier: "gold",
    },
    inputSchema: {
      type: "object",
      properties: {
        transcript: { type: "string" },
      },
      required: ["transcript"],
    },
    expectedOutputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        actions: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    },
    itemCount: 57,
    evalCount: 5,
    updatedAt: "5 hrs ago",
  },
] as const;

export const designModeExperiments = [
  {
    id: "exp_prompt_compression",
    projectId: "prompt-studio",
    name: "Prompt compression test",
    status: "Running",
    improvement: "+8.2%",
    updatedAt: "19 min ago",
  },
  {
    id: "exp_judge_thresholds",
    projectId: "eval-lab",
    name: "Judge threshold tuning",
    status: "Draft",
    improvement: "Pending",
    updatedAt: "2 hrs ago",
  },
  {
    id: "exp_meeting_summary",
    projectId: "meeting-memory",
    name: "Meeting summary rewrite",
    status: "Completed",
    improvement: "+5.4%",
    updatedAt: "4 hrs ago",
  },
  {
    id: "exp_support_handoff",
    projectId: "test",
    name: "Support handoff prompts",
    status: "Running",
    improvement: "+3.1%",
    updatedAt: "6 hrs ago",
  },
] as const;

export const designModeDashboardWidgets = [
  {
    id: "widget_top_traces",
    projectId: "test",
    name: "Top traces",
    description: "Most active trace names in the selected window.",
    view: "traces",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "count", agg: "count" }],
    filters: [],
    chartType: "HORIZONTAL_BAR",
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: 8,
      show_value_labels: true,
    },
    minVersion: 1,
    owner: "PROJECT",
    createdAt: "4 days ago",
    updatedAt: "14 min ago",
  },
  {
    id: "widget_model_costs",
    projectId: "test",
    name: "Model costs",
    description: "Cost by model for generation traffic.",
    view: "observations",
    dimensions: [{ field: "providedModelName" }],
    metrics: [{ measure: "totalCost", agg: "sum" }],
    filters: [
      {
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
        type: "stringOptions",
      },
    ],
    chartType: "HORIZONTAL_BAR",
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: 8,
      show_value_labels: true,
    },
    minVersion: 1,
    owner: "PROJECT",
    createdAt: "4 days ago",
    updatedAt: "11 min ago",
  },
  {
    id: "widget_user_cost",
    projectId: "test",
    name: "User cost",
    description: "Spend distribution by user.",
    view: "observations",
    dimensions: [{ field: "userId" }],
    metrics: [{ measure: "totalCost", agg: "sum" }],
    filters: [
      {
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
        type: "stringOptions",
      },
    ],
    chartType: "HORIZONTAL_BAR",
    chartConfig: {
      type: "HORIZONTAL_BAR",
      row_limit: 8,
      show_value_labels: true,
    },
    minVersion: 1,
    owner: "PROJECT",
    createdAt: "3 days ago",
    updatedAt: "9 min ago",
  },
  {
    id: "widget_score_trend",
    projectId: "test",
    name: "Helpfulness trend",
    description: "Average helpfulness score over time.",
    view: "scores-numeric",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "value", agg: "avg" }],
    filters: [
      {
        column: "name",
        operator: "=",
        value: "helpfulness",
        type: "string",
      },
    ],
    chartType: "LINE_TIME_SERIES",
    chartConfig: {
      type: "LINE_TIME_SERIES",
    },
    minVersion: 1,
    owner: "PROJECT",
    createdAt: "2 days ago",
    updatedAt: "8 min ago",
  },
  {
    id: "widget_prompt_versions",
    projectId: "prompt-studio",
    name: "Prompt versions",
    description: "Active prompt versions by name.",
    view: "traces",
    dimensions: [{ field: "name" }],
    metrics: [{ measure: "count", agg: "count" }],
    filters: [],
    chartType: "VERTICAL_BAR",
    chartConfig: {
      type: "VERTICAL_BAR",
      row_limit: 6,
    },
    minVersion: 1,
    owner: "PROJECT",
    createdAt: "5 days ago",
    updatedAt: "34 min ago",
  },
  {
    id: "widget_eval_scores",
    projectId: "eval-lab",
    name: "Judge score mix",
    description: "Score counts by evaluation source.",
    view: "scores-categorical",
    dimensions: [{ field: "stringValue" }],
    metrics: [{ measure: "count", agg: "count" }],
    filters: [],
    chartType: "VERTICAL_BAR",
    chartConfig: {
      type: "VERTICAL_BAR",
      row_limit: 6,
    },
    minVersion: 1,
    owner: "PROJECT",
    createdAt: "3 days ago",
    updatedAt: "1 hr ago",
  },
];

export const designModeDashboards = [
  {
    id: "dash_ops_overview",
    projectId: "test",
    name: "Operations overview",
    description: "Daily operating view for the redesign project.",
    filters: [],
    owner: "PROJECT",
    createdAt: "6 days ago",
    updatedAt: "12 min ago",
    definition: {
      widgets: [
        {
          type: "widget",
          id: "placement_top_traces",
          widgetId: "widget_top_traces",
          x: 0,
          y: 0,
          x_size: 6,
          y_size: 4,
        },
        {
          type: "widget",
          id: "placement_model_costs",
          widgetId: "widget_model_costs",
          x: 6,
          y: 0,
          x_size: 6,
          y_size: 4,
        },
        {
          type: "widget",
          id: "placement_user_cost",
          widgetId: "widget_user_cost",
          x: 0,
          y: 4,
          x_size: 6,
          y_size: 4,
        },
        {
          type: "widget",
          id: "placement_score_trend",
          widgetId: "widget_score_trend",
          x: 6,
          y: 4,
          x_size: 6,
          y_size: 4,
        },
      ],
    },
  },
  {
    id: "dash_prompt_release",
    projectId: "prompt-studio",
    name: "Prompt release",
    description: "Prompt and rollout visibility for content work.",
    filters: [],
    owner: "PROJECT",
    createdAt: "9 days ago",
    updatedAt: "37 min ago",
    definition: {
      widgets: [
        {
          type: "widget",
          id: "placement_prompt_versions",
          widgetId: "widget_prompt_versions",
          x: 0,
          y: 0,
          x_size: 12,
          y_size: 5,
        },
      ],
    },
  },
  {
    id: "dash_eval_watch",
    projectId: "eval-lab",
    name: "Evaluation watch",
    description: "Judge results and score mix for the lab project.",
    filters: [],
    owner: "PROJECT",
    createdAt: "8 days ago",
    updatedAt: "1 hr ago",
    definition: {
      widgets: [
        {
          type: "widget",
          id: "placement_eval_scores",
          widgetId: "widget_eval_scores",
          x: 0,
          y: 0,
          x_size: 12,
          y_size: 5,
        },
      ],
    },
  },
];

export const designModeAnnotationQueues = [
  {
    id: "queue_support_qa",
    projectId: "test",
    name: "Support QA queue",
    description: "Review low-confidence support answers before they ship.",
    items: 14,
    reviewers: 3,
    updatedAt: "7 min ago",
  },
  {
    id: "queue_checkout_edge_cases",
    projectId: "launchpad",
    name: "Checkout edge cases",
    description: "Human review queue for high-risk checkout regressions.",
    items: 8,
    reviewers: 2,
    updatedAt: "41 min ago",
  },
  {
    id: "queue_meeting_notes",
    projectId: "meeting-memory",
    name: "Meeting note spot checks",
    description: "Validate summary quality and action item extraction.",
    items: 11,
    reviewers: 4,
    updatedAt: "1 hr ago",
  },
] as const;

export const designModeEvaluators = [
  {
    id: "eval_config_helpfulness",
    projectId: "test",
    evalTemplateId: "eval_template_helpfulness",
    scoreName: "helpfulness",
    targetObject: "TRACE",
    filter: [],
    variableMapping: [],
    sampling: 1,
    delay: 30,
    status: "ACTIVE",
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    jobType: "EVAL",
    createdAt: "2 hrs ago",
    updatedAt: "11 min ago",
    timeScope: ["LIVE"],
    evalTemplate: {
      id: "eval_template_helpfulness",
      name: "Helpfulness judge",
      partner: null,
      projectId: null,
      prompt:
        "Score whether the answer fully resolves the user question on a 0-1 scale.",
      provider: "openai",
      model: "gpt-4.1-mini",
      modelParams: { temperature: 0 },
      vars: ["input", "output"],
      outputDefinition: {
        type: "object",
        properties: {
          score: { type: "number" },
          reasoning: { type: "string" },
        },
        required: ["score"],
      },
      version: 3,
    },
    executionCounts: {
      pending: 4,
      completed: 128,
      error: 2,
    },
    totalCost7d: 14.82,
  },
  {
    id: "eval_config_groundedness",
    projectId: "test",
    evalTemplateId: "eval_template_groundedness",
    scoreName: "groundedness",
    targetObject: "TRACE",
    filter: [],
    variableMapping: [],
    sampling: 0.6,
    delay: 45,
    status: "PAUSED",
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    jobType: "EVAL",
    createdAt: "4 hrs ago",
    updatedAt: "52 min ago",
    timeScope: ["LIVE"],
    evalTemplate: {
      id: "eval_template_groundedness",
      name: "Groundedness judge",
      partner: null,
      projectId: null,
      prompt:
        "Verify that the answer is supported by the supplied context and cite unsupported claims.",
      provider: "anthropic",
      model: "claude-3.7-sonnet",
      modelParams: { temperature: 0 },
      vars: ["context", "output"],
      outputDefinition: {
        type: "object",
        properties: {
          score: { type: "number" },
          unsupportedClaims: { type: "array", items: { type: "string" } },
        },
        required: ["score"],
      },
      version: 2,
    },
    executionCounts: {
      pending: 0,
      completed: 86,
      error: 0,
    },
    totalCost7d: 9.31,
  },
  {
    id: "eval_config_recall",
    projectId: "eval-lab",
    evalTemplateId: "eval_template_recall",
    scoreName: "recall",
    targetObject: "DATASET",
    filter: [],
    variableMapping: [],
    sampling: 1,
    delay: 0,
    status: "ACTIVE",
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    jobType: "EVAL",
    createdAt: "1 day ago",
    updatedAt: "39 min ago",
    timeScope: ["LIVE", "HISTORIC"],
    evalTemplate: {
      id: "eval_template_recall",
      name: "Recall benchmark",
      partner: "ragas",
      projectId: null,
      prompt:
        "Compare retrieved passages against expected references and compute recall.",
      provider: "openai",
      model: "gpt-4.1-mini",
      modelParams: { temperature: 0 },
      vars: ["retrievals", "expected"],
      outputDefinition: {
        type: "object",
        properties: {
          score: { type: "number" },
        },
        required: ["score"],
      },
      version: 1,
    },
    executionCounts: {
      pending: 12,
      completed: 64,
      error: 3,
    },
    totalCost7d: 21.47,
  },
] as const;

export const designModeLlmApiKeys = [
  {
    id: "llm_key_openai",
    projectId: "test",
    provider: "OpenAI",
    adapter: "openai",
    displaySecretKey: "sk-live-...7FQ2",
    baseURL: null,
    customModels: ["gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    withDefaultModels: true,
    extraHeaderKeys: [],
    config: null,
  },
  {
    id: "llm_key_anthropic",
    projectId: "test",
    provider: "Anthropic",
    adapter: "anthropic",
    displaySecretKey: "sk-ant-...91KL",
    baseURL: null,
    customModels: ["claude-3.7-sonnet", "claude-3.5-haiku"],
    withDefaultModels: true,
    extraHeaderKeys: [],
    config: null,
  },
  {
    id: "llm_key_google",
    projectId: "eval-lab",
    provider: "Google AI Studio",
    adapter: "google-ai-studio",
    displaySecretKey: "AIza...9M0P",
    baseURL: null,
    customModels: ["gemini-2.5-pro", "gemini-2.0-flash"],
    withDefaultModels: true,
    extraHeaderKeys: [],
    config: null,
  },
] as const;

export const designModeLlmTools = [
  {
    id: "tool_search_docs",
    projectId: "test",
    name: "search_docs",
    description: "Search the Langfuse docs index for relevant answers.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
    createdAt: "2 days ago",
    updatedAt: "18 min ago",
  },
  {
    id: "tool_lookup_release_notes",
    projectId: "test",
    name: "lookup_release_notes",
    description: "Fetch recent release notes by version or date.",
    parameters: {
      type: "object",
      properties: {
        version: { type: "string" },
      },
    },
    createdAt: "5 days ago",
    updatedAt: "1 hr ago",
  },
  {
    id: "tool_dataset_probe",
    projectId: "eval-lab",
    name: "dataset_probe",
    description: "Inspect evaluation datasets for a matching test case.",
    parameters: {
      type: "object",
      properties: {
        dataset: { type: "string" },
        query: { type: "string" },
      },
      required: ["dataset", "query"],
    },
    createdAt: "6 days ago",
    updatedAt: "43 min ago",
  },
] as const;

export const designModeLlmSchemas = [
  {
    id: "schema_support_answer",
    projectId: "test",
    name: "SupportAnswer",
    description: "Structured support response with citations and escalation.",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        citations: { type: "array", items: { type: "string" } },
        escalationRequired: { type: "boolean" },
      },
      required: ["answer"],
    },
    createdAt: "3 days ago",
    updatedAt: "26 min ago",
  },
  {
    id: "schema_release_summary",
    projectId: "test",
    name: "ReleaseSummary",
    description: "Release summary with highlights, risk, and rollout notes.",
    schema: {
      type: "object",
      properties: {
        highlights: { type: "array", items: { type: "string" } },
        riskLevel: { type: "string" },
        rolloutNotes: { type: "string" },
      },
      required: ["highlights"],
    },
    createdAt: "8 days ago",
    updatedAt: "2 hrs ago",
  },
  {
    id: "schema_eval_report",
    projectId: "eval-lab",
    name: "EvalReport",
    description: "Evaluator output schema with score and reasoning.",
    schema: {
      type: "object",
      properties: {
        score: { type: "number" },
        reasoning: { type: "string" },
      },
      required: ["score"],
    },
    createdAt: "4 days ago",
    updatedAt: "58 min ago",
  },
] as const;

export type DesignModeSlug =
  | "tracing"
  | "sessions"
  | "users"
  | "prompts"
  | "playground"
  | "scores"
  | "evals"
  | "human-annotation"
  | "datasets"
  | "experiments"
  | "settings";

export type DesignModeMetric = {
  label: string;
  value: string;
  hint?: string;
};

export type DesignModeSectionItem = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  meta?: string;
};

export type DesignModeSection = {
  title: string;
  description?: string;
  items: DesignModeSectionItem[];
};

export type DesignModePageData = {
  title: string;
  description: string;
  metrics: DesignModeMetric[];
  sections: DesignModeSection[];
};

const totalSessionTraceCount = designModeSessions.reduce(
  (sum, session) => sum + session.traceCount,
  0,
);
const totalDatasetItems = designModeDatasets.reduce(
  (sum, dataset) => sum + dataset.itemCount,
  0,
);
const totalAnnotationItems = designModeAnnotationQueues.reduce(
  (sum, queue) => sum + queue.items,
  0,
);
const totalQueueReviewers = designModeAnnotationQueues.reduce(
  (sum, queue) => sum + queue.reviewers,
  0,
);
const averageTraceScore =
  designModeTraces.reduce(
    (sum, trace) => sum + Number.parseFloat(trace.score),
    0,
  ) / designModeTraces.length;
const bestExperimentLift =
  designModeExperiments
    .map((experiment) =>
      Number.parseFloat(experiment.improvement.replace("%", "")),
    )
    .filter((improvement) => !Number.isNaN(improvement))
    .reduce((best, improvement) => Math.max(best, improvement), 0) || 0;

function getProjectName(projectId: string) {
  return (
    designModeProjects.find((project) => project.id === projectId)?.name ??
    "Unknown project"
  );
}

function getTopModels() {
  const usageByModel = new Map<
    string,
    { count: number; latestTimestamp: string; latestLatency: string }
  >();

  designModeTraces.forEach((trace) => {
    const current = usageByModel.get(trace.model);
    if (!current) {
      usageByModel.set(trace.model, {
        count: 1,
        latestTimestamp: trace.timestamp,
        latestLatency: trace.latency,
      });
      return;
    }

    usageByModel.set(trace.model, {
      count: current.count + 1,
      latestTimestamp: current.latestTimestamp,
      latestLatency: current.latestLatency,
    });
  });

  return Array.from(usageByModel.entries())
    .sort((left, right) => right[1].count - left[1].count)
    .slice(0, 4)
    .map(([model, stats]) => ({
      id: model,
      title: model,
      subtitle: `${stats.count} recent runs`,
      badge: stats.latestLatency,
      meta: `Last seen ${stats.latestTimestamp}`,
    }));
}

export function getDesignModePageData(
  slug: DesignModeSlug,
): DesignModePageData {
  switch (slug) {
    case "tracing":
      return {
        title: "Tracing",
        description:
          "Recent traces, active sessions, and quality signals for layout work.",
        metrics: [
          {
            label: "Recent traces",
            value: `${designModeTraces.length}`,
            hint: "Seeded across production, staging, development, and preview",
          },
          {
            label: "Avg score",
            value: averageTraceScore.toFixed(2),
            hint: "Computed from the shared mock trace corpus",
          },
          {
            label: "Projects with traces",
            value: `${designModeProjects.filter((project) => project.hasTraces).length}`,
          },
        ],
        sections: [
          {
            title: "Recent traces",
            items: designModeTraces.map((trace) => ({
              id: trace.id,
              title: trace.name,
              subtitle: `${getProjectName(trace.projectId)} · ${trace.model} · ${trace.user}`,
              badge: trace.environment,
              meta: `Score ${trace.score} · ${trace.latency} · ${trace.timestamp}`,
            })),
          },
          {
            title: "Active sessions",
            description:
              "Session state seeded from the same mock project graph.",
            items: designModeSessions.map((session) => ({
              id: session.id,
              title: session.name,
              subtitle: `${getProjectName(session.projectId)} · ${session.user}`,
              badge: session.status,
              meta: `${session.traceCount} traces · ${session.lastSeen}`,
            })),
          },
          {
            title: "Recent scorecards",
            items: designModeScores.map((score) => ({
              id: score.id,
              title: score.name,
              subtitle: `${score.traceName} · ${score.reviewer}`,
              badge: score.value,
              meta: score.updatedAt,
            })),
          },
        ],
      };
    case "sessions":
      return {
        title: "Sessions",
        description:
          "Session flows with owners, activity state, and trace volume.",
        metrics: [
          {
            label: "Live sessions",
            value: `${designModeSessions.filter((session) => session.status === "Active").length}`,
          },
          {
            label: "Watching",
            value: `${designModeSessions.filter((session) => session.status === "Watching").length}`,
          },
          {
            label: "Traces in sessions",
            value: `${totalSessionTraceCount}`,
          },
        ],
        sections: [
          {
            title: "Session activity",
            items: designModeSessions.map((session) => ({
              id: session.id,
              title: session.name,
              subtitle: `${getProjectName(session.projectId)} · ${session.user}`,
              badge: session.status,
              meta: `${session.traceCount} traces · ${session.lastSeen}`,
            })),
          },
          {
            title: "Frequent contributors",
            description:
              "People seeded across orgs and projects for filters and ownership UI.",
            items: designModeUsers.map((user) => ({
              id: user.id,
              title: user.name,
              subtitle: `${user.team} · ${user.role}`,
              badge: user.lastActive,
              meta: `${user.traces} traces · ${user.scores} scores`,
            })),
          },
        ],
      };
    case "users":
      return {
        title: "Users",
        description:
          "Seeded user activity, roles, and output volume for people-centric views.",
        metrics: [
          { label: "Tracked users", value: `${designModeUsers.length}` },
          {
            label: "Teams",
            value: `${new Set(designModeUsers.map((user) => user.team)).size}`,
          },
          {
            label: "Total prompts",
            value: `${designModeUsers.reduce((sum, user) => sum + user.prompts, 0)}`,
          },
        ],
        sections: [
          {
            title: "Team members",
            items: designModeUsers.map((user) => ({
              id: user.id,
              title: user.name,
              subtitle: `${user.email} · ${user.team}`,
              badge: user.role,
              meta: `${user.traces} traces · ${user.prompts} prompts · ${user.scores} scores`,
            })),
          },
          {
            title: "Organizations",
            items: designModeOrganizations.map((organization) => ({
              id: organization.id,
              title: organization.name,
              subtitle: `${organization.projects.length} projects`,
              badge: organization.plan.replace("cloud:", ""),
              meta: organization.aiFeaturesEnabled
                ? "AI features enabled"
                : "AI features disabled",
            })),
          },
        ],
      };
    case "prompts":
      return {
        title: "Prompts",
        description:
          "Versioned prompt records with labels, models, and owning projects.",
        metrics: [
          { label: "Prompt versions", value: `${designModePrompts.length}` },
          {
            label: "Production labels",
            value: `${designModePrompts.filter((prompt) => prompt.label === "production").length}`,
          },
          {
            label: "Models",
            value: `${new Set(designModePrompts.map((prompt) => prompt.model)).size}`,
          },
        ],
        sections: [
          {
            title: "Prompt versions",
            items: designModePrompts.map((prompt) => ({
              id: prompt.id,
              title: prompt.name,
              subtitle: `${getProjectName(prompt.projectId)} · ${prompt.version} · ${prompt.model}`,
              badge: prompt.label,
              meta: prompt.updatedAt,
            })),
          },
          {
            title: "Linked evaluations",
            items: designModeExperiments.map((experiment) => ({
              id: experiment.id,
              title: experiment.name,
              subtitle: experiment.updatedAt,
              badge: experiment.status,
              meta: experiment.improvement,
            })),
          },
        ],
      };
    case "playground":
      return {
        title: "Playground",
        description:
          "Ready-to-run prompt variants, model presets, and recent example runs.",
        metrics: [
          { label: "Runnable prompts", value: `${designModePrompts.length}` },
          {
            label: "Model presets",
            value: `${new Set(designModeTraces.map((trace) => trace.model)).size}`,
          },
          {
            label: "Example runs",
            value: `${designModeTraces.slice(0, 6).length}`,
          },
        ],
        sections: [
          {
            title: "Starter runs",
            items: designModeTraces.slice(0, 6).map((trace) => ({
              id: trace.id,
              title: trace.name,
              subtitle: `${getProjectName(trace.projectId)} · ${trace.user}`,
              badge: trace.environment,
              meta: `${trace.model} · ${trace.latency} · score ${trace.score}`,
            })),
          },
          {
            title: "Saved prompt variants",
            items: designModePrompts.map((prompt) => ({
              id: prompt.id,
              title: prompt.name,
              subtitle: `${prompt.version} · ${getProjectName(prompt.projectId)}`,
              badge: prompt.label,
              meta: `${prompt.model} · ${prompt.updatedAt}`,
            })),
          },
          {
            title: "Top models",
            items: getTopModels(),
          },
        ],
      };
    case "scores":
      return {
        title: "Scores",
        description: "Evaluation outputs and review signals for seeded traces.",
        metrics: [
          { label: "Score rows", value: `${designModeScores.length}` },
          {
            label: "Human reviewed",
            value: `${designModeScores.filter((score) => score.reviewer !== "LLM judge").length}`,
          },
          {
            label: "LLM judged",
            value: `${designModeScores.filter((score) => score.reviewer === "LLM judge").length}`,
          },
        ],
        sections: [
          {
            title: "Recent scores",
            items: designModeScores.map((score) => ({
              id: score.id,
              title: score.name,
              subtitle: `${score.traceName} · ${score.reviewer}`,
              badge: score.value,
              meta: score.updatedAt,
            })),
          },
          {
            title: "Evaluation datasets",
            items: designModeDatasets.map((dataset) => ({
              id: dataset.id,
              title: dataset.name,
              subtitle: `${dataset.itemCount} items`,
              badge: `${dataset.evalCount} evals`,
              meta: dataset.updatedAt,
            })),
          },
        ],
      };
    case "evals":
      return {
        title: "LLM-as-a-Judge",
        description:
          "Evaluation jobs, scorecards, and datasets for judge-related redesigns.",
        metrics: [
          {
            label: "Configured evals",
            value: `${designModeExperiments.length}`,
          },
          {
            label: "Running",
            value: `${designModeExperiments.filter((experiment) => experiment.status === "Running").length}`,
          },
          {
            label: "Datasets linked",
            value: `${designModeDatasets.length}`,
          },
        ],
        sections: [
          {
            title: "Evaluation runs",
            items: designModeExperiments.map((experiment) => ({
              id: experiment.id,
              title: experiment.name,
              subtitle: experiment.updatedAt,
              badge: experiment.status,
              meta: experiment.improvement,
            })),
          },
          {
            title: "Backing datasets",
            items: designModeDatasets.map((dataset) => ({
              id: dataset.id,
              title: dataset.name,
              subtitle: `${dataset.itemCount} items`,
              badge: `${dataset.evalCount} evals`,
              meta: dataset.updatedAt,
            })),
          },
          {
            title: "Score dimensions",
            items: designModeScores.map((score) => ({
              id: score.id,
              title: score.name,
              subtitle: score.traceName,
              badge: score.value,
              meta: score.reviewer,
            })),
          },
        ],
      };
    case "human-annotation":
      return {
        title: "Human Annotation",
        description: "Queue capacity, review coverage, and seeded work items.",
        metrics: [
          { label: "Queues", value: `${designModeAnnotationQueues.length}` },
          { label: "Queued items", value: `${totalAnnotationItems}` },
          { label: "Reviewer slots", value: `${totalQueueReviewers}` },
        ],
        sections: [
          {
            title: "Annotation queues",
            items: designModeAnnotationQueues.map((queue) => ({
              id: queue.id,
              title: queue.name,
              subtitle: `${queue.reviewers} reviewers`,
              badge: `${queue.items} items`,
              meta: queue.updatedAt,
            })),
          },
          {
            title: "Available reviewers",
            items: designModeUsers.slice(0, 4).map((user) => ({
              id: user.id,
              title: user.name,
              subtitle: `${user.team} · ${user.role}`,
              badge: user.lastActive,
              meta: `${user.scores} reviews this week`,
            })),
          },
        ],
      };
    case "datasets":
      return {
        title: "Datasets",
        description:
          "Seeded dataset inventory, item volume, and linked evaluation work.",
        metrics: [
          { label: "Datasets", value: `${designModeDatasets.length}` },
          { label: "Total items", value: `${totalDatasetItems}` },
          {
            label: "Attached evals",
            value: `${designModeDatasets.reduce((sum, dataset) => sum + dataset.evalCount, 0)}`,
          },
        ],
        sections: [
          {
            title: "Dataset catalog",
            items: designModeDatasets.map((dataset) => ({
              id: dataset.id,
              title: dataset.name,
              subtitle: `${dataset.itemCount} items`,
              badge: `${dataset.evalCount} evals`,
              meta: dataset.updatedAt,
            })),
          },
          {
            title: "Linked experiments",
            items: designModeExperiments.map((experiment) => ({
              id: experiment.id,
              title: experiment.name,
              subtitle: experiment.updatedAt,
              badge: experiment.status,
              meta: experiment.improvement,
            })),
          },
        ],
      };
    case "experiments":
      return {
        title: "Experiments",
        description: "Comparative runs, rollout status, and impact snapshots.",
        metrics: [
          { label: "Experiments", value: `${designModeExperiments.length}` },
          {
            label: "Running",
            value: `${designModeExperiments.filter((experiment) => experiment.status === "Running").length}`,
          },
          { label: "Best lift", value: `+${bestExperimentLift.toFixed(1)}%` },
        ],
        sections: [
          {
            title: "Experiment runs",
            items: designModeExperiments.map((experiment) => ({
              id: experiment.id,
              title: experiment.name,
              subtitle: experiment.updatedAt,
              badge: experiment.status,
              meta: experiment.improvement,
            })),
          },
          {
            title: "Related prompts",
            items: designModePrompts.slice(0, 5).map((prompt) => ({
              id: prompt.id,
              title: prompt.name,
              subtitle: `${prompt.version} · ${getProjectName(prompt.projectId)}`,
              badge: prompt.label,
              meta: prompt.model,
            })),
          },
        ],
      };
    case "settings":
      return {
        title: "Settings",
        description:
          "Project settings, memberships, and environment metadata seeded for safe redesign work.",
        metrics: [
          {
            label: "Organizations",
            value: `${designModeOrganizations.length}`,
          },
          { label: "Projects", value: `${designModeProjects.length}` },
          { label: "Members", value: `${designModeUsers.length}` },
        ],
        sections: [
          {
            title: "Organizations",
            items: designModeOrganizations.map((organization) => ({
              id: organization.id,
              title: organization.name,
              subtitle: `${organization.projects.length} projects`,
              badge: organization.plan.replace("cloud:", ""),
              meta: organization.aiFeaturesEnabled
                ? "AI features enabled"
                : "AI features disabled",
            })),
          },
          {
            title: "Projects",
            items: designModeProjects.map((project) => ({
              id: project.id,
              title: project.name,
              subtitle: project.organizationName,
              badge: `${project.retentionDays}d retention`,
              meta: project.hasTraces ? "Has traces" : "Awaiting first traces",
            })),
          },
          {
            title: "Members",
            items: designModeUsers.map((user) => ({
              id: user.id,
              title: user.name,
              subtitle: `${user.email} · ${user.role}`,
              badge: user.team,
              meta: user.lastActive,
            })),
          },
        ],
      };
  }
}
