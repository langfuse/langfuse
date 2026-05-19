import type { Prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

export const ONBOARDING_STARTER_PROJECT_METADATA_KEY =
  "langfuseCloudOnboardingStarterProject";

const starterProjectMetadataSchema = z.object({
  createdByUserId: z.string(),
  showInviteMembersPrompt: z.boolean(),
});

export type StarterProjectMetadata = z.infer<
  typeof starterProjectMetadataSchema
>;

const asMetadataRecord = (metadata: unknown): Prisma.InputJsonObject =>
  metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Prisma.InputJsonObject)
    : {};

export const buildStarterProjectMetadata = ({
  userId,
  metadata,
  showInviteMembersPrompt = true,
}: {
  userId: string;
  metadata?: unknown;
  showInviteMembersPrompt?: boolean;
}): Prisma.InputJsonObject => ({
  ...asMetadataRecord(metadata),
  [ONBOARDING_STARTER_PROJECT_METADATA_KEY]: starterProjectMetadataSchema.parse(
    {
      createdByUserId: userId,
      showInviteMembersPrompt,
    },
  ),
});

const getStarterProjectMetadata = (
  metadata: unknown,
): StarterProjectMetadata | null => {
  const parsed = starterProjectMetadataSchema.safeParse(
    asMetadataRecord(metadata)[ONBOARDING_STARTER_PROJECT_METADATA_KEY],
  );

  return parsed.success ? parsed.data : null;
};

export const shouldShowStarterProjectInvitePrompt = ({
  metadata,
  userId,
}: {
  metadata: unknown;
  userId: string;
}) => {
  const starterMetadata = getStarterProjectMetadata(metadata);

  return (
    starterMetadata?.createdByUserId === userId &&
    starterMetadata.showInviteMembersPrompt
  );
};

export const clearStarterProjectInvitePrompt = ({
  metadata,
  userId,
}: {
  metadata: unknown;
  userId: string;
}): Prisma.InputJsonObject => {
  const starterMetadata = getStarterProjectMetadata(metadata);
  const metadataRecord = asMetadataRecord(metadata);

  if (
    !starterMetadata ||
    starterMetadata.createdByUserId !== userId ||
    !starterMetadata.showInviteMembersPrompt
  ) {
    return metadataRecord;
  }

  return {
    ...metadataRecord,
    [ONBOARDING_STARTER_PROJECT_METADATA_KEY]: {
      ...starterMetadata,
      showInviteMembersPrompt: false,
    },
  };
};
