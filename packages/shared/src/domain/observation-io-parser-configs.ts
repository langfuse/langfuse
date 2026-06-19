import z from "zod";
import { singleFilter } from "../interfaces/filters";

export const ObservationIoParserSourceSchema = z.enum([
  "input",
  "output",
  "metadata",
]);

export const ObservationIoParserDisplaySchema = z.enum([
  "auto",
  "json",
  "markdown",
]);

export const ObservationIoParserFieldInstructionSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  source: ObservationIoParserSourceSchema,
  jsonPath: z.string().trim().min(1).max(500),
  display: ObservationIoParserDisplaySchema.default("auto"),
});

export const ObservationIoParserInstructionsSchema = z
  .object({
    version: z.literal(1),
    fields: z.array(ObservationIoParserFieldInstructionSchema).min(1).max(50),
  })
  .superRefine((instructions, ctx) => {
    const seenKeys = new Set<string>();

    instructions.fields.forEach((field, index) => {
      const normalizedKey = field.key.toLowerCase();
      if (seenKeys.has(normalizedKey)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate field key "${field.key}"`,
          path: ["fields", index, "key"],
        });
      }
      seenKeys.add(normalizedKey);
    });
  });

export const ObservationIoParserConfigDomainSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  priority: z.number().int(),
  filters: z.array(singleFilter),
  instructions: ObservationIoParserInstructionsSchema,
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
});

export const ObservationIoParserConfigListItemSchema =
  ObservationIoParserConfigDomainSchema.extend({
    createdByUser: z
      .object({
        image: z.string().nullish(),
        name: z.string().nullish(),
      })
      .nullish(),
    updatedByUser: z
      .object({
        image: z.string().nullish(),
        name: z.string().nullish(),
      })
      .nullish(),
  });

export const ObservationIoParserProjectPreferenceSchema = z.object({
  projectId: z.string(),
  userId: z.null(),
  enabled: z.boolean(),
  selectedConfigId: z.string().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
  updatedBy: z.string().nullable(),
});

export const ObservationIoParserUserPreferenceSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  enabled: z.boolean(),
  selectedConfigId: z.string().nullable(),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
  updatedBy: z.string().nullable(),
});

export const ObservationIoParserResolvedPreferenceSchema = z.object({
  enabled: z.boolean(),
  disabledScope: z.enum(["project", "user"]).nullable(),
  selectedConfigId: z.string().nullable(),
});

export const ObservationIoParserFieldResultSchema = z.object({
  key: z.string(),
  label: z.string(),
  source: ObservationIoParserSourceSchema,
  display: ObservationIoParserDisplaySchema,
  value: z.unknown(),
  status: z.enum(["ok", "miss", "error"]),
  error: z.string().optional(),
});

export const ParsedObservationIoResponseSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("parsed"),
    observationId: z.string(),
    matchedConfig: z.object({
      id: z.string(),
      name: z.string(),
      priority: z.number().int(),
    }),
    fields: z.array(ObservationIoParserFieldResultSchema),
    diagnostics: z.object({
      eventBytes: z.number(),
      parseDurationMs: z.number(),
    }),
  }),
  z.object({
    mode: z.literal("raw_fallback"),
    observationId: z.string(),
    reason: z.enum([
      "v4_beta_disabled",
      "project_disabled",
      "user_disabled",
      "no_active_configs",
      "event_not_found",
      "event_too_large",
      "no_matching_config",
      "parser_error",
      "parsed_output_too_large",
    ]),
    eventBytes: z.number().optional(),
  }),
]);

export type ObservationIoParserSource = z.infer<
  typeof ObservationIoParserSourceSchema
>;
export type ObservationIoParserDisplay = z.infer<
  typeof ObservationIoParserDisplaySchema
>;
export type ObservationIoParserInstructions = z.infer<
  typeof ObservationIoParserInstructionsSchema
>;
export type ObservationIoParserConfigDomain = z.infer<
  typeof ObservationIoParserConfigDomainSchema
>;
export type ObservationIoParserConfigListItem = z.infer<
  typeof ObservationIoParserConfigListItemSchema
>;
export type ObservationIoParserProjectPreferenceDomain = z.infer<
  typeof ObservationIoParserProjectPreferenceSchema
>;
export type ObservationIoParserUserPreferenceDomain = z.infer<
  typeof ObservationIoParserUserPreferenceSchema
>;
export type ObservationIoParserResolvedPreference = z.infer<
  typeof ObservationIoParserResolvedPreferenceSchema
>;
export type ObservationIoParserFieldResult = z.infer<
  typeof ObservationIoParserFieldResultSchema
>;
export type ParsedObservationIoResponse = z.infer<
  typeof ParsedObservationIoResponseSchema
>;
