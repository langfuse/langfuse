export const DEV_PATHS = {
  organizations: "/dev/organization-overview",
  home: "/dev/home",
  dashboard: "/dev/dashboard",
  tracing: "/dev/tracing",
  sessions: "/dev/sessions",
  users: "/dev/users",
  prompts: "/dev/prompts",
  playground: "/dev/playground",
  scores: "/dev/scores",
  evals: "/dev/evals",
  humanAnnotation: "/dev/human-annotation",
  datasets: "/dev/datasets",
  experiments: "/dev/experiments",
  settings: "/dev/settings",
  greenfield: "/dev/greenfield",
} as const;

export const DEV_PLACEHOLDER_PAGES = {
  tracing: {
    title: "Tracing",
    description:
      "Design preview for tracing exploration without touching the production route.",
  },
  sessions: {
    title: "Sessions",
    description:
      "Design preview for session UX, flows, and layout experiments.",
  },
  users: {
    title: "Users",
    description: "Design preview for user analytics and profile concepts.",
  },
  prompts: {
    title: "Prompts",
    description: "Design preview for prompt management redesign work.",
  },
  scores: {
    title: "Scores",
    description:
      "Design preview for score exploration and evaluation surfaces.",
  },
  evals: {
    title: "LLM-as-a-Judge",
    description:
      "Design preview for evaluation criteria, runs, and review workflows.",
  },
  "human-annotation": {
    title: "Human Annotation",
    description:
      "Design preview for human annotation workflows and experiments.",
  },
  datasets: {
    title: "Datasets",
    description: "Design preview for dataset views and curation flows.",
  },
  experiments: {
    title: "Experiments",
    description:
      "Design preview for experiments and comparative analysis concepts.",
  },
  settings: {
    title: "Settings",
    description: "Design preview for settings IA and management flows.",
  },
} as const;

export type DevPlaceholderSlug = keyof typeof DEV_PLACEHOLDER_PAGES;

export function isDevPlaceholderSlug(slug: string): slug is DevPlaceholderSlug {
  return slug in DEV_PLACEHOLDER_PAGES;
}
