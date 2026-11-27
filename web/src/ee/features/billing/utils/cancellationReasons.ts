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
