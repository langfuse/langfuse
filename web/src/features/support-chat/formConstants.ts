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

/**
 * Severity levels shown to the user. Wording mirrors the Pylon issue
 * "Priority" field. Each maps to a Pylon `case_severity` value
 * (Sev-1/Sev-2/Sev-3) in `mapToPylonCaseSeverity`.
 */
export const SeveritySchema = z.enum([
  "Severity 1 (Critical Business Impact)",
  "Severity 2 (Major Business Impact)",
  "Severity 3 (Minor Business Impact or General Questions)",
]);
export type Severity = z.infer<typeof SeveritySchema>;

export const SEVERITY_1 = SeveritySchema.options[0];
export const SEVERITY_2 = SeveritySchema.options[1];
export const SEVERITY_3 = SeveritySchema.options[2];

/**
 * Plans that may raise Severity 1 (Sev-1) and Severity 2 (Sev-2) support
 * requests — Enterprise only. All other plans (and free/unknown plans) are
 * limited to Severity 3. Mirrors the check in `mapToPylonCaseSeverity`.
 */
export const ENTERPRISE_SUPPORT_PLANS = [
  "cloud:enterprise",
  "self-hosted:enterprise",
] as const;

/** Whether the given plan may raise Severity 1/2 support requests. */
export const isEnterpriseSupportPlan = (plan?: string): boolean =>
  !!plan && (ENTERPRISE_SUPPORT_PLANS as readonly string[]).includes(plan);

/**
 * Plans whose support requests carry no Pylon `case_severity` at all: the
 * field is omitted from the issue instead of defaulting to Sev-3. See
 * `mapToPylonCaseSeverity`.
 */
export const NO_CASE_SEVERITY_SUPPORT_PLANS = [
  "cloud:hobby",
  "cloud:core",
] as const;

/** Whether support requests from the given plan carry no case severity. */
export const isPlanWithoutCaseSeverity = (plan?: string): boolean =>
  !!plan &&
  (NO_CASE_SEVERITY_SUPPORT_PLANS as readonly string[]).includes(plan);

/**
 * Whether a given severity level can be selected on the given plan. Used both
 * to grey out options in the UI and as a server-side safeguard in
 * `mapToPylonCaseSeverity`.
 */
export const isSeverityAllowedForPlan = (
  severity: string,
  plan?: string,
): boolean => {
  if (severity === SEVERITY_1 || severity === SEVERITY_2)
    return isEnterpriseSupportPlan(plan);
  return true; // Severity 3 is always available
};

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
