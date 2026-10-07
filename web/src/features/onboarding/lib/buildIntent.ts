/**
 * Temporary onboarding question: "What will you use Langfuse for?"
 *
 * Up to three picks, optional. "Just exploring" clears the other picks.
 * The five use cases are shuffled per user, seeded by the user id, so the
 * order is the same on every reload and on the server, which recomputes each
 * pick's shown position from the user id. "Just exploring" and "Other" stay
 * last.
 *
 * Removal: delete this file, `BuildIntentFieldset.tsx`, the `buildIntent*`
 * fields in the onboarding router, service and form.
 */

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

// z.enum needs a non-empty tuple type.
export const BUILD_INTENT_IDS = [
  ...USE_CASE_OPTIONS,
  ...PINNED_BUILD_INTENT_OPTIONS,
].map((option) => option.id) as [BuildIntentId, ...BuildIntentId[]];

export const BUILD_INTENT_MAX_SELECTIONS = 3;
export const BUILD_INTENT_OTHER_MAX_LENGTH = 500;
export const EXCLUSIVE_BUILD_INTENT: BuildIntentId = "just_exploring";
export const OTHER_BUILD_INTENT: BuildIntentId = "other";
const PARK_MILLER_MODULUS = 2147483647;

/**
 * Orders the options for one user: use cases shuffled (Fisher–Yates), "Just
 * exploring" and "Other" last.
 *
 * @example
 * const options = orderBuildIntentOptions(session.user.id);
 * options.at(-1)?.id; // "other"
 */
export const orderBuildIntentOptions = (
  userId: string,
): BuildIntentOption[] => {
  const random = createSeededRandom(userId);
  const shuffled: BuildIntentOption[] = [...USE_CASE_OPTIONS];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return [...shuffled, ...PINNED_BUILD_INTENT_OPTIONS];
};

/**
 * Where each pick appeared in the list this user saw (0-based), recomputed
 * from the user id instead of trusting the client.
 *
 * @example
 * getShownPositions("user-1", ["rag", "other"]); // e.g. [2, 6]
 */
export const getShownPositions = (
  userId: string,
  buildIntents: BuildIntentId[],
): number[] => {
  const shownOrder = orderBuildIntentOptions(userId).map((option) => option.id);
  return buildIntents.map((id) => shownOrder.indexOf(id));
};

/**
 * Applies one checkbox toggle to the current picks: "Just exploring" clears
 * every other pick and is cleared by any of them; a pick beyond the cap is
 * ignored.
 *
 * @example
 * toggleBuildIntent(["rag"], "just_exploring", true); // ["just_exploring"]
 */
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

/** Park–Miller generator seeded by a string hash; same sequence for the same seed on client and server. */
const createSeededRandom = (seed: string) => {
  let state = 1;
  for (const character of seed) {
    state = (state * 31 + character.charCodeAt(0)) % PARK_MILLER_MODULUS;
  }
  // A zero state would make the generator return 0 forever.
  if (state === 0) state = 1;

  return () => {
    state = (state * 48271) % PARK_MILLER_MODULUS;
    return state / PARK_MILLER_MODULUS;
  };
};
