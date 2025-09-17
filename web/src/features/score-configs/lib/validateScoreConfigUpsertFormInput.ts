import { ScoreConfigSchema } from "@langfuse/shared";
import { type CreateConfig, type UpdateConfig } from "./upsertFormTypes";

const MOCK_CONFIG_METADATA = {
  id: "123",
  projectId: "123",
  isArchived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const validateScoreConfigUpsertFormInput = (
  values: CreateConfig | UpdateConfig,
): string | null => {
  const result = ScoreConfigSchema.safeParse({
    ...MOCK_CONFIG_METADATA,
    ...values,
    categories: values.categories?.length ? values.categories : undefined,
  });

  return result.error
    ? result.error?.issues.map((issue) => issue.message).join(", ")
    : null;
};
