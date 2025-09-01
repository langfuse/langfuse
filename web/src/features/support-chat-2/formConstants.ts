// formModels.ts
import { z } from "zod";

/** ── Message Type ────────────────────────────────────────────────────────── */
export const MessageTypeSchema = z.enum(["Question", "Feedback", "Bug"]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/** ── Form Sections (for your stepper/wizard) ─────────────────────────────── */
export const FormSectionSchema = z.enum(["intro", "form", "success"]);
export type FormSection = z.infer<typeof FormSectionSchema>;

/** ── Topics (grouped + flattened) ────────────────────────────────────────── */
export const TopicGroups = {
  Operations: [
    "Account Changes",
    "Account Deletion",
    "Billing / Usage",
    "Slack Connect Channel",
    "Inviting Users",
  ],
  "Product Features": ["Tracing", "Prompt Management", "Evals", "Platform"],
} as const;

export type TopicGroup = keyof typeof TopicGroups;

export const ALL_TOPICS = [
  ...TopicGroups.Operations,
  ...TopicGroups["Product Features"],
] as const;

export const TopicSchema = z.enum(ALL_TOPICS);
export type Topic = z.infer<typeof TopicSchema>;

/** ── Severity ────────────────────────────────────────────────────────────── */
export const SeveritySchema = z.enum([
  "Question or feature request",
  "Feature not working as expected",
  "Feature is not working at all",
  "Outage, data loss, or data breach",
]);
export type Severity = z.infer<typeof SeveritySchema>;

/** ── Full form schema (ready for react-hook-form) ───────────────────────────
 * Adjust min length or messages to your taste.
 */
export const SupportFormSchema = z.object({
  messageType: MessageTypeSchema.default("Question"),
  severity: SeveritySchema,
  topic: z.union([TopicSchema, z.string()]), // allow empty string for controlled form
  message: z
    .string()
    .trim()
    .min(10, "Please add a bit more detail (at least 10 characters)."),
});

export type SupportFormValues = z.infer<typeof SupportFormSchema>;

/** ── Nice-to-haves for UI components ─────────────────────────────────────── */
export const MESSAGE_TYPES = MessageTypeSchema.options;
export const FORM_SECTIONS = FormSectionSchema.options;
export const SEVERITIES = SeveritySchema.options;
