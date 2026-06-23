import z from "zod";
import {
  ObservationIoParserInstructionsSchema,
  ObservationIoParserPreferenceSelectionModeSchema,
} from "../../../domain/observation-io-parser-configs";
import { singleFilter } from "../../../interfaces/filters";
import { getObservationIoParserFilterValidationErrors } from "../../../features/observation-io-parsers/validateParserFilters";
import { validateObservationIoParserJsonPath } from "../../../features/observation-io-parsers/jsonPath";

export const ObservationIoParserFiltersInput = z
  .array(singleFilter)
  .superRefine((filters, ctx) => {
    for (const error of getObservationIoParserFilterValidationErrors(filters)) {
      ctx.addIssue({
        code: "custom",
        message: error.message,
        path: [error.index, "column"],
      });
    }
  });

export const ObservationIoParserInstructionsInput =
  ObservationIoParserInstructionsSchema.superRefine((instructions, ctx) => {
    instructions.fields.forEach((field, index) => {
      const validation = validateObservationIoParserJsonPath(field.jsonPath);
      if (!validation.success) {
        ctx.addIssue({
          code: "custom",
          message: validation.error,
          path: ["fields", index, "jsonPath"],
        });
      }
    });
  });

export const CreateObservationIoParserConfigInput = z.object({
  projectId: z.string(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).optional(),
  filters: ObservationIoParserFiltersInput.default([]),
  instructions: ObservationIoParserInstructionsInput,
});

export const UpdateObservationIoParserConfigInput =
  CreateObservationIoParserConfigInput.extend({
    id: z.string(),
  });

export const DeleteObservationIoParserConfigInput = z.object({
  projectId: z.string(),
  id: z.string(),
});

const SetObservationIoParserPreferenceInput = z
  .object({
    projectId: z.string(),
    enabled: z.boolean(),
    selectionMode: ObservationIoParserPreferenceSelectionModeSchema.optional(),
    selectedConfigId: z.string().nullable().optional(),
  })
  .superRefine((preference, ctx) => {
    if (preference.selectionMode === "config" && !preference.selectedConfigId) {
      ctx.addIssue({
        code: "custom",
        message: "selectedConfigId is required for config preferences",
        path: ["selectedConfigId"],
      });
    }
  });

export const SetObservationIoParserProjectPreferenceInput =
  SetObservationIoParserPreferenceInput;

export const SetObservationIoParserUserPreferenceInput =
  SetObservationIoParserPreferenceInput;

export const ParsedObservationIoInput = z.object({
  projectId: z.string(),
  observation: z.object({
    id: z.string(),
    traceId: z.string(),
  }),
  minStartTime: z.date(),
  maxStartTime: z.date(),
});

export type CreateObservationIoParserConfigInput = z.infer<
  typeof CreateObservationIoParserConfigInput
>;
export type UpdateObservationIoParserConfigInput = z.infer<
  typeof UpdateObservationIoParserConfigInput
>;
export type DeleteObservationIoParserConfigInput = z.infer<
  typeof DeleteObservationIoParserConfigInput
>;
export type SetObservationIoParserProjectPreferenceInput = z.infer<
  typeof SetObservationIoParserProjectPreferenceInput
>;
export type SetObservationIoParserUserPreferenceInput = z.infer<
  typeof SetObservationIoParserUserPreferenceInput
>;
export type ParsedObservationIoInput = z.infer<typeof ParsedObservationIoInput>;
