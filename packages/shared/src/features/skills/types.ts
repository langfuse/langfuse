import { z } from "zod/v4";
import { jsonSchema } from "../../utils/zod";
import { PromptLabelSchema } from "../prompts/types";
import { COMMIT_MESSAGE_MAX_LENGTH } from "../prompts/constants";
import {
  MAX_SKILL_FILES,
  MAX_SKILL_BYTES,
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

export const SkillFileContentSchema = z
  .string()
  .transform((content) => content.replace(/^\uFEFF+/, ""))
  .superRefine((content, ctx) => {
    if (content.includes("\0")) {
      ctx.addIssue({
        code: "custom",
        message: "Skill files must not contain NUL characters",
      });
    }
    if (!content.isWellFormed()) {
      ctx.addIssue({
        code: "custom",
        message: "Skill files must contain well-formed Unicode text",
      });
    }
    if (new TextEncoder().encode(content).byteLength > MAX_SKILL_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `Skill files must not exceed ${MAX_SKILL_BYTES} UTF-8 bytes`,
      });
    }
  });

const SKILL_TEXT_FILE_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "rst",
  "adoc",
  "json",
  "jsonc",
  "jsonl",
  "ndjson",
  "yaml",
  "yml",
  "toml",
  "xml",
  "csv",
  "tsv",
  "ini",
  "cfg",
  "conf",
  "properties",
  "log",
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "py",
  "pyi",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "cs",
  "swift",
  "kt",
  "kts",
  "lua",
  "r",
  "pl",
  "php",
  "sql",
  "graphql",
  "gql",
  "tex",
]);

const SkillTextFilePathSchema = SkillFilePathSchema.refine((path) => {
  const filename = path.split("/").at(-1)!;
  const extension = filename.includes(".")
    ? filename.split(".").at(-1)!.toLowerCase()
    : "";
  return SKILL_TEXT_FILE_EXTENSIONS.has(extension);
}, "Skill files must use a supported text file extension");

export const SkillVersionFileInputSchema = z.object({
  path: SkillTextFilePathSchema,
  content: SkillFileContentSchema,
  sha256Hash: z.never().optional(),
});

export const SkillVersionFileReferenceSchema = z.object({
  path: SkillTextFilePathSchema,
  sha256Hash: z
    .string()
    .regex(
      /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/,
      "Must be a canonical base64 encoded SHA-256 hash",
    ),
  content: z.never().optional(),
});

export const SkillTagsSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(50);

export const CreateSkillVersionBodySchema = z
  .object({
    files: z
      .array(
        z.union([SkillVersionFileInputSchema, SkillVersionFileReferenceSchema]),
      )
      .min(1)
      .max(MAX_SKILL_FILES),
    commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).nullish(),
  })
  .superRefine(({ files }, ctx) => {
    if (
      files.reduce(
        (total, file) =>
          total +
          (file.content !== undefined
            ? new TextEncoder().encode(file.content).byteLength
            : 0),
        0,
      ) > MAX_SKILL_BYTES
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: `A skill must not exceed ${MAX_SKILL_BYTES} UTF-8 bytes in total`,
      });
    }
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
  search: z.string().max(1000).optional(),
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

export const SkillFileContentResponseSchema = z.object({
  content: z.string(),
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
  description: SkillDescriptionSchema,
  tags: z.array(z.string()),
  latestVersion: z.number().int().positive(),
  latestVersionCreatedAt: z.coerce.date(),
  latestVersionLastUpdatedAt: z.coerce.date(),
  productionVersion: z.number().int().positive().nullable(),
});

export const ListSkillsResponseSchema = z.object({
  data: z.array(SkillMetaSchema),
  meta: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
    hasNextPage: z.boolean(),
  }),
});

export const DeleteSkillVersionResponseSchema = z.object({
  deleted: z.boolean(),
});

export type CreateSkillVersionBody = z.infer<
  typeof CreateSkillVersionBodySchema
>;
export type SkillSelector = z.infer<typeof SkillSelectorSchema>;
export type ListSkillsQuery = z.infer<typeof ListSkillsQuerySchema>;
export type SkillVersionResponse = z.infer<typeof SkillVersionSchema>;
