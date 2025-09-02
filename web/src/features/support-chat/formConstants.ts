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
  integrationType: z.string().optional(),
  topic: z
    .union([TopicSchema, z.literal("")])
    .refine((val) => val !== "", { message: "Please select a topic." })
    .transform((val) => val as z.infer<typeof TopicSchema>),
  message: z.string().trim().min(1, "Message cannot be empty."), // 🚨 no empty strings allowed
});
export type SupportFormValues = z.infer<typeof SupportFormSchema>;

export const MESSAGE_TYPES = MessageTypeSchema.options;
export const FORM_SECTIONS = FormSectionSchema.options;
export const SEVERITIES = SeveritySchema.options;
export const INTEGRATION_TYPES = IntegrationTypeSchema.options;
