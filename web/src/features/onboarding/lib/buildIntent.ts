/** Temporary onboarding question; remove with `BuildIntentFieldset` and the `buildIntent*` fields and event props. */

const USE_CASE_OPTIONS = [
  {
    id: "chat_agent",
    label: "Chat or support agent",
    hint: "Customer-facing assistant or bot",
  },
  {
    id: "rag",
    label: "Q&A over documents (RAG)",
    hint: "Search your docs, knowledge base",
  },
  {
    id: "workflow_automation",
    label: "AI workflow automation",
    hint: "Extraction, n8n / Temporal",
  },
  {
    id: "autonomous_agents",
    label: "Autonomous agents",
    hint: "Multi-step or long-running tasks",
  },
  {
    id: "coding_agents",
    label: "Trace my coding agents",
    hint: "Claude Code, Cursor, Codex",
  },
] as const;

const PINNED_BUILD_INTENT_OPTIONS = [
  { id: "just_exploring", label: "Just exploring", hint: undefined },
  { id: "other", label: "Other", hint: undefined },
] as const;

export type BuildIntentId =
  | (typeof USE_CASE_OPTIONS)[number]["id"]
  | (typeof PINNED_BUILD_INTENT_OPTIONS)[number]["id"];

export type BuildIntentOption = {
  id: BuildIntentId;
  label: string;
  hint: string | undefined;
};

export const BUILD_INTENT_IDS = [
  ...USE_CASE_OPTIONS,
  ...PINNED_BUILD_INTENT_OPTIONS,
].map((option) => option.id) as [BuildIntentId, ...BuildIntentId[]];

export const BUILD_INTENT_MAX_SELECTIONS = 3;
export const BUILD_INTENT_OTHER_MAX_LENGTH = 500;
export const EXCLUSIVE_BUILD_INTENT: BuildIntentId = "just_exploring";
export const OTHER_BUILD_INTENT: BuildIntentId = "other";

/** Use cases in random order, then "Just exploring" and "Other". */
export const shuffleBuildIntentOptions = (): BuildIntentOption[] => {
  const shuffled: BuildIntentOption[] = [...USE_CASE_OPTIONS];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return [...shuffled, ...PINNED_BUILD_INTENT_OPTIONS];
};

/** Applies one toggle: "Just exploring" is exclusive and picks past the cap are ignored. */
export const toggleBuildIntent = (
  current: BuildIntentId[],
  id: BuildIntentId,
  isChecked: boolean,
): BuildIntentId[] => {
  if (!isChecked) return current.filter((picked) => picked !== id);
  if (id === EXCLUSIVE_BUILD_INTENT) return [id];

  const withoutExclusive = current.filter(
    (picked) => picked !== EXCLUSIVE_BUILD_INTENT && picked !== id,
  );
  if (withoutExclusive.length >= BUILD_INTENT_MAX_SELECTIONS) return current;

  return [...withoutExclusive, id];
};

/** Event payload for a submit that stored the survey; metadata only, so free text never reaches PostHog. */
export const getSurveySubmittedEvent = ({
  surveyCreated,
  buildIntents,
  hasReferralSource,
  surveyDurationMs,
}: {
  surveyCreated: boolean;
  buildIntents: BuildIntentId[];
  hasReferralSource: boolean;
  surveyDurationMs: number;
}) => {
  if (!surveyCreated) return null;

  return {
    properties: {
      buildIntents,
      buildIntentCount: buildIntents.length,
      hasReferralSource,
      surveyDurationMs,
    },
    options:
      buildIntents.length > 0
        ? { $set_once: { onboardingBuildIntents: buildIntents } }
        : undefined,
  };
};
