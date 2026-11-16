import z from "zod";

import { COMMIT_MESSAGE_MAX_LENGTH } from "../features/prompts/constants";

/**
 * Halo works on the same unsaved skill draft the skill editor keeps in the
 * browser tab, one per skill. These are browser tools: the user's browser
 * runs them on that draft and reports the result back to Halo.
 */
const InAppAgentSkillDraftTargetSchema = z.object({
  skillName: z
    .string()
    .min(1)
    .max(200)
    .nullish()
    .describe(
      "Name of the existing skill whose draft to use. Omit it for the draft of a new skill.",
    ),
});

export type InAppAgentSkillDraftTarget = z.infer<
  typeof InAppAgentSkillDraftTargetSchema
>;

export const InAppAgentEditSkillDraftArgsSchema =
  InAppAgentSkillDraftTargetSchema.extend({
    files: z
      .array(
        z.object({
          path: z.string().min(1).max(500),
          content: z.string(),
        }),
      )
      .optional()
      .describe(
        "Files to create or replace, with their full content. Files you leave out stay as they are.",
      ),
    deletedPaths: z
      .array(z.string().min(1).max(500))
      .optional()
      .describe("Paths of files to remove from the draft."),
    commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).optional(),
  });

export type InAppAgentEditSkillDraftArgs = z.infer<
  typeof InAppAgentEditSkillDraftArgsSchema
>;

export const InAppAgentReadSkillDraftArgsSchema =
  InAppAgentSkillDraftTargetSchema;

export const InAppAgentCreateSkillFromDraftArgsSchema =
  InAppAgentSkillDraftTargetSchema;

/** The user did not let the browser run the tool. */
const DeclinedSchema = z.object({ status: z.literal("declined") });
const ErrorSchema = z.object({
  status: z.literal("error"),
  message: z.string(),
});

/**
 * The draft as the browser holds it. Unchanged files carry no content, since
 * they match the version the draft is based on.
 */
export const InAppAgentSkillDraftSnapshotSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("open"),
      /** The skill name in SKILL.md. */
      name: z.string(),
      baseVersion: z.number().int().positive().nullable(),
      href: z.string().min(1),
      files: z.array(
        z.object({
          path: z.string(),
          status: z.enum(["unchanged", "modified", "added"]),
          content: z.string().optional(),
        }),
      ),
      deletedPaths: z.array(z.string()),
      commitMessage: z.string(),
    }),
    z.object({ status: z.literal("notFound") }),
    ErrorSchema,
    DeclinedSchema,
  ],
);

export type InAppAgentSkillDraftSnapshot = z.infer<
  typeof InAppAgentSkillDraftSnapshotSchema
>;

/** What the browser did when asked to create a version from the draft. */
export const InAppAgentSkillDraftOutcomeSchema = z.discriminatedUnion(
  "status",
  [
    z.object({
      status: z.literal("created"),
      name: z.string().min(1),
      version: z.number().int().positive(),
    }),
    z.object({ status: z.literal("notFound") }),
    ErrorSchema,
    DeclinedSchema,
  ],
);

export type InAppAgentSkillDraftOutcome = z.infer<
  typeof InAppAgentSkillDraftOutcomeSchema
>;
