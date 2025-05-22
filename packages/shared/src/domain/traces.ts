import z from "zod/v4";
import { jsonSchema, jsonSchemaNullable } from "../utils/zod";

export const MetadataDomain = z.record(
  z.string(),
  jsonSchemaNullable.or(z.undefined()),
);

export type MetadataDomain = z.infer<typeof MetadataDomain>;

// to be used across the application in frontend and backend.
export const TraceDomain = z.object({
  id: z.string(),
  name: z.string().nullable(),
  timestamp: z.date(),
  environment: z.string(),
  tags: z.array(z.string()),
  bookmarked: z.boolean(),
  public: z.boolean(),
  release: z.string().nullable(),
  version: z.string().nullable(),
  input: jsonSchema.nullable(),
  output: jsonSchema.nullable(),
  metadata: MetadataDomain,
  createdAt: z.date(),
  updatedAt: z.date(),
  sessionId: z.string().nullable(),
  userId: z.string().nullable(),
  projectId: z.string(),
});

export type TraceDomain = z.infer<typeof TraceDomain>;
