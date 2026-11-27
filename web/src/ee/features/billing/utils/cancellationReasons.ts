import * as z from "zod";

export const cancellationReasonIds = [
  "too_expensive",
  "surprise_bill",
  "not_using",
  "missing_feature",
  "switching_tool",
  "self_hosting",
  "other",
] as const;

const CancellationReasonSchema = z.enum(cancellationReasonIds);
export type CancellationReason = z.infer<typeof CancellationReasonSchema>;

export const CANCELLATION_NOTE_MAX_LENGTH = 2000;

export const CancellationFeedbackSchema = z.object({
  reason: CancellationReasonSchema,
  note: z.string().trim().max(CANCELLATION_NOTE_MAX_LENGTH).optional(),
});
export type CancellationFeedback = z.infer<typeof CancellationFeedbackSchema>;

export type CancellationReasonOption = {
  id: CancellationReason;
  label: string;
  /** Shown in the empty note field once this reason is picked. */
  notePlaceholder: string;
};

export const cancellationReasons: ReadonlyArray<CancellationReasonOption> = [
  {
    id: "too_expensive",
    label: "It costs too much",
    notePlaceholder: "What would have felt fair?",
  },
  {
    id: "surprise_bill",
    label: "The bill was higher than expected",
    notePlaceholder: "What did you expect to pay?",
  },
  {
    id: "not_using",
    label: "We're not using it enough",
    notePlaceholder: "Did the project end, or did something get in the way?",
  },
  {
    id: "missing_feature",
    label: "It's missing something we need",
    notePlaceholder: "What were you looking for?",
  },
  {
    id: "switching_tool",
    label: "We're switching to another tool",
    notePlaceholder: "Which one, and what does it do better?",
  },
  {
    id: "self_hosting",
    label: "We're moving to self-hosted Langfuse",
    notePlaceholder: "What made self-hosting the better fit?",
  },
  {
    id: "other",
    label: "Something else",
    notePlaceholder: "Tell us what happened",
  },
];

const LEHMER_MODULUS = 2147483647;
const LEHMER_MULTIPLIER = 48271;

/** Turns a user id into a seed between 1 and the generator's modulus. */
function seedFromString(value: string): number {
  let hash = 7;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) % LEHMER_MODULUS;
  }
  return (hash % (LEHMER_MODULUS - 1)) + 1;
}

/** A Lehmer generator of numbers in [0, 1); its first values are discarded so near seeds diverge. */
function seededRandom(seed: number): () => number {
  let state = seed;
  const next = () => {
    state = (state * LEHMER_MULTIPLIER) % LEHMER_MODULUS;
    return state / LEHMER_MODULUS;
  };
  for (let warmUp = 0; warmUp < 8; warmUp++) next();
  return next;
}

/**
 * The reasons in the order one person sees them: the same on every open,
 * different between people, with "Something else" always last.
 */
export function orderReasonsForUser(
  userId: string,
): ReadonlyArray<CancellationReasonOption> {
  const shuffled = cancellationReasons.filter(
    (reason) => reason.id !== "other",
  );
  const last = cancellationReasons.filter((reason) => reason.id === "other");
  const random = seededRandom(seedFromString(userId));
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1));
    const moved = shuffled[index];
    const replaced = shuffled[swapWith];
    if (moved === undefined || replaced === undefined) continue;
    shuffled[index] = replaced;
    shuffled[swapWith] = moved;
  }
  return [...shuffled, ...last];
}

/** Where the picked reason sat in the list the person saw; ids only. */
export const CancellationReasonPlacementSchema = z.object({
  /** 1-based. */
  reasonPosition: z.number().int().min(1).max(cancellationReasonIds.length),
  /** The reason ids in the order shown, comma-separated. */
  reasonOrder: z.string().max(200),
});
export type CancellationReasonPlacement = z.infer<
  typeof CancellationReasonPlacementSchema
>;

/** What a person picked on the way to their reason: the first pick and how often they switched. */
export type CancellationReasonPicks = {
  firstReason: CancellationReason | null;
  lastReason: CancellationReason | null;
  reasonChangeCount: number;
};

export const noCancellationReasonPicks: CancellationReasonPicks = {
  firstReason: null,
  lastReason: null,
  reasonChangeCount: 0,
};

/** The picks after one more pick; picking the same reason again changes nothing. */
export function withCancellationReasonPick(
  picks: CancellationReasonPicks,
  reason: CancellationReason,
): CancellationReasonPicks {
  if (picks.lastReason === null) {
    return { firstReason: reason, lastReason: reason, reasonChangeCount: 0 };
  }
  if (picks.lastReason === reason) return picks;
  return {
    ...picks,
    lastReason: reason,
    reasonChangeCount: picks.reasonChangeCount + 1,
  };
}

/** Stripe's cancellation_details.feedback values this flow can send. */
type StripeCancellationFeedback =
  | "too_expensive"
  | "unused"
  | "missing_features"
  | "switched_service"
  | "other";

const stripeFeedbackByReason: Record<
  CancellationReason,
  StripeCancellationFeedback
> = {
  too_expensive: "too_expensive",
  surprise_bill: "too_expensive",
  not_using: "unused",
  missing_feature: "missing_features",
  switching_tool: "switched_service",
  self_hosting: "switched_service",
  other: "other",
};

/**
 * Builds Stripe's cancellation_details. Stripe's feedback list is coarser
 * than ours, so the comment starts with our reason id in brackets.
 */
export function toStripeCancellationDetails(feedback: CancellationFeedback): {
  feedback: StripeCancellationFeedback;
  comment: string;
} {
  const note = feedback.note?.trim();
  return {
    feedback: stripeFeedbackByReason[feedback.reason],
    comment: note ? `[${feedback.reason}] ${note}` : `[${feedback.reason}]`,
  };
}

export type CancellationNextStep = "spend_alert" | "learn" | "call";

const nextStepByReason: Record<
  CancellationReason,
  CancellationNextStep | null
> = {
  too_expensive: "spend_alert",
  surprise_bill: "spend_alert",
  not_using: "learn",
  missing_feature: "call",
  switching_tool: "call",
  self_hosting: "call",
  other: null,
};

export const cancellationNextStepContent: Record<
  CancellationNextStep,
  { title: string; detail: string; actionLabel: string }
> = {
  spend_alert: {
    title: "Get an email before the bill grows",
    detail:
      "A spend alert tells your team when this period's spend passes an amount you set. It takes a minute, and you keep your plan and your data.",
    actionLabel: "Set a spend alert",
  },
  learn: {
    title: "See what teams set up after tracing",
    detail:
      "Most of the value comes after the first traces: evaluations on production data, prompt versions and dashboards. The docs walk through each in a few minutes.",
    actionLabel: "Open the docs",
  },
  call: {
    title: "Tell us in 15 minutes",
    detail:
      "Talk to someone from the team about what is missing or what the other tool does better. We will say plainly whether Langfuse can do it.",
    actionLabel: "Book a call",
  },
};

/** The one next step offered for a reason, or null when the flow offers none. */
export function nextStepForReason(
  reason: CancellationReason,
  options: { isNextStepEnabled: boolean },
): CancellationNextStep | null {
  if (!options.isNextStepEnabled) return null;
  return nextStepByReason[reason];
}

export type CancelFlowStep = "reason" | "next_step" | "confirm";

/** The step that follows the reason step. */
export function stepAfterReason(
  reason: CancellationReason,
  options: { isNextStepEnabled: boolean },
): CancelFlowStep {
  return nextStepForReason(reason, options) === null ? "confirm" : "next_step";
}
