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
    "Inviting Users",
    "Set Up SSO",
    "Slack Connect Channel",
  ],
  "Product Features": [
    "Observability",
    "Prompt Management",
    "Evaluation",
    "Platform",
    "Other",
  ],
} as const;

export type TopicGroup = keyof typeof TopicGroups;

export const ALL_TOPICS = [
  ...TopicGroups.Operations,
  ...TopicGroups["Product Features"],
] as const;

export const TopicSchema = z.enum(ALL_TOPICS);
export type Topic = z.infer<typeof TopicSchema>;

export const SeveritySchema = z.enum([
  "Question or feature request",
  "Feature not working as expected",
  "Feature is not working at all",
  "Outage, data loss, or data breach",
]);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Plans that may manually flag a support request as high priority (Sev-1).
 * Mirrors the high-tier check in `mapToPylonCaseSeverity`.
 */
export const HIGH_TIER_SUPPORT_PLANS = [
  "cloud:team",
  "cloud:enterprise",
  "self-hosted:enterprise",
] as const;

/** Whether the given plan may manually escalate a support request to Sev-1. */
export const isHighTierSupportPlan = (plan?: string): boolean =>
  !!plan && (HIGH_TIER_SUPPORT_PLANS as readonly string[]).includes(plan);

export const IntegrationTypeSchema = z.enum([
  "Python SDK",
  "TypeScript SDK",
  "Other SDK",
  "Public API",
  "OpenAI SDK",
  "Vercel AI SDK",
  "LangChain",
  "LangGraph",
  "OTel Instrumentation",
  "LLM Proxy (LiteLLM)",
  "3rd Party (Dify / LangFlow / Flowise)",
  "Other (please specify)",
]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const SupportFormSchema = z.object({
  messageType: MessageTypeSchema.default("Question"),
  severity: SeveritySchema,
  /**
   * Manual high-priority (Sev-1) escalation. Only honored server-side for
   * high-tier plans (see {@link isHighTierSupportPlan}).
   */
  isHighPriority: z.boolean().default(false),
  integrationType: z.string().optional(),
  topic: z
    .union([TopicSchema, z.literal("")])
    .refine((val) => val !== "", { message: "Please select a topic." })
    .transform((val) => val as z.infer<typeof TopicSchema>),
  message: z
    .string()
    .trim()
    .min(1, "Please provide a description of your issue."),
});
export type SupportFormValues = z.infer<typeof SupportFormSchema>;

export const MESSAGE_TYPES = MessageTypeSchema.options;
export const FORM_SECTIONS = FormSectionSchema.options;
export const SEVERITIES = SeveritySchema.options;
export const INTEGRATION_TYPES = IntegrationTypeSchema.options;
