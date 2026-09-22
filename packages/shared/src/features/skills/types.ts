import { z } from "zod/v4";
import { jsonSchema } from "../../utils/zod";
import { PromptLabelSchema } from "../prompts/types";
import { COMMIT_MESSAGE_MAX_LENGTH } from "../prompts/constants";
import {
  MAX_SKILL_FILES,
  MAX_SKILL_PATH_LENGTH,
  SKILL_LATEST_LABEL,
} from "./constants";

export const SkillNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Skill names may only contain lowercase letters, numbers, and single hyphens",
  );

export const SkillDescriptionSchema = z.string().trim().min(1).max(1024);

export const SkillFilePathSchema = z
  .string()
  .min(1)
  .max(MAX_SKILL_PATH_LENGTH)
  .superRefine((path, ctx) => {
    const segments = path.split("/");
    const hasControlCharacters = [...path].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    if (
      path.startsWith("/") ||
      path.endsWith("/") ||
      path.includes("\\") ||
      hasControlCharacters ||
      segments.some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "File paths must be normalized relative POSIX paths",
      });
    }
  });

export const SkillBlobDescriptorSchema = z.object({
  sha256Hash: z
    .string()
    .regex(
      /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/,
      "Must be a canonical base64 encoded SHA-256 hash",
    ),
  contentType: z.string().trim().min(1).max(255),
  contentLength: z.number().int().positive(),
});

export const PrepareSkillUploadsBodySchema = z.object({
  blobs: z.array(SkillBlobDescriptorSchema).min(1).max(MAX_SKILL_FILES),
});

export const PreparedSkillUploadSchema = SkillBlobDescriptorSchema.extend({
  blobId: z.string(),
  uploadUrl: z.url().nullable(),
});

export const PrepareSkillUploadsResponseSchema = z.object({
  data: z.array(PreparedSkillUploadSchema),
});

export const SkillVersionFileInputSchema = z.object({
  path: SkillFilePathSchema,
  blobId: z.string().min(1),
});

export const SkillTagsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(50);

export const CreateSkillVersionBodySchema = z
  .object({
    files: z.array(SkillVersionFileInputSchema).min(1).max(MAX_SKILL_FILES),
    commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).nullish(),
  })
  .superRefine(({ files }, ctx) => {
    const paths = files.map((file) => file.path);
    if (new Set(paths).size !== paths.length) {
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: "Skill file paths must be unique",
      });
    }
    if (!paths.includes("SKILL.md")) {
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: "Every skill version must contain a root SKILL.md file",
      });
    }
  });

export const SkillSelectorSchema = z
  .object({
    version: z.coerce.number().int().positive().optional(),
    label: PromptLabelSchema.optional(),
  })
  .refine(({ version, label }) => !(version && label), {
    message: "Specify either version or label, not both",
  });

export const ListSkillsQuerySchema = z.object({
  name: SkillNameSchema.optional(),
  label: PromptLabelSchema.optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  fromUpdatedAt: z.iso.datetime({ offset: true }).optional(),
  toUpdatedAt: z.iso.datetime({ offset: true }).optional(),
});

export const UpdateSkillLabelsBodySchema = z.object({
  labels: z
    .array(PromptLabelSchema)
    .refine((labels) => !labels.includes(SKILL_LATEST_LABEL), {
      message: `The '${SKILL_LATEST_LABEL}' label is managed by Langfuse`,
    }),
});

export const UpdateSkillTagsBodySchema = z.object({
  tags: SkillTagsSchema,
});

export const SkillFileSchema = z.object({
  id: z.string(),
  path: SkillFilePathSchema,
  blobId: z.string(),
  sha256Hash: z.string(),
  contentType: z.string(),
  contentLength: z.number().int(),
});

export const SkillFileDownloadSchema = z.object({
  downloadUrl: z.url(),
  downloadUrlExpiresAt: z.iso.datetime({ offset: true }),
});

export const SkillVersionSchema = z.object({
  id: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  projectId: z.string(),
  createdBy: z.string(),
  name: SkillNameSchema,
  description: SkillDescriptionSchema,
  frontmatter: jsonSchema,
  version: z.number().int().positive(),
  tags: z.array(z.string()),
  labels: z.array(PromptLabelSchema),
  commitMessage: z.string().nullable(),
  files: z.array(SkillFileSchema),
});

export const SkillMetaSchema = z.object({
  name: SkillNameSchema,
  versions: z.array(z.number().int().positive()),
  labels: z.array(PromptLabelSchema),
  tags: z.array(z.string()),
  lastUpdatedAt: z.coerce.date(),
  latestVersion: z.number().int().positive(),
  description: SkillDescriptionSchema,
});

export const ListSkillsResponseSchema = z.object({
  data: z.array(SkillMetaSchema),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export const DeleteSkillVersionResponseSchema = z.object({
  deleted: z.boolean(),
});

export type PrepareSkillUploadsBody = z.infer<
  typeof PrepareSkillUploadsBodySchema
>;
export type CreateSkillVersionBody = z.infer<
  typeof CreateSkillVersionBodySchema
>;
export type SkillSelector = z.infer<typeof SkillSelectorSchema>;
export type ListSkillsQuery = z.infer<typeof ListSkillsQuerySchema>;
export type SkillVersionResponse = z.infer<typeof SkillVersionSchema>;
