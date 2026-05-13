import { z } from "zod";

export const ONBOARDING_STARTER_PROJECT_METADATA_KEY =
  "langfuseCloudOnboardingStarterProject";
export const ONBOARDING_STARTER_ORG_METADATA_KEY =
  "langfuseCloudOnboardingStarterOrganization";

const starterProjectMetadataSchema = z.object({
  createdByUserId: z.string(),
  showInviteMembersPrompt: z.boolean(),
});

const starterOrgMetadataSchema = z.object({
  createdByUserId: z.string(),
});

export type StarterProjectMetadata = z.infer<
  typeof starterProjectMetadataSchema
>;

const asMetadataRecord = (metadata: unknown): Record<string, unknown> =>
  metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};

export const buildStarterOrganizationMetadata = ({
  userId,
  metadata,
}: {
  userId: string;
  metadata?: unknown;
}) => ({
  ...asMetadataRecord(metadata),
  [ONBOARDING_STARTER_ORG_METADATA_KEY]: starterOrgMetadataSchema.parse({
    createdByUserId: userId,
  }),
});

export const buildStarterProjectMetadata = ({
  userId,
  metadata,
  showInviteMembersPrompt = true,
}: {
  userId: string;
  metadata?: unknown;
  showInviteMembersPrompt?: boolean;
}) => ({
  ...asMetadataRecord(metadata),
  [ONBOARDING_STARTER_PROJECT_METADATA_KEY]: starterProjectMetadataSchema.parse(
    {
      createdByUserId: userId,
      showInviteMembersPrompt,
    },
  ),
});

export const getStarterProjectMetadata = (
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
}) => {
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
