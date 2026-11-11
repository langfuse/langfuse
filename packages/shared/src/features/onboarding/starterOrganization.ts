export const DEFAULT_STARTER_PROJECT_NAME = "My Project";

export const STARTER_ORGANIZATION_METADATA = {
  langfuseOnboarding: {
    starterOrganization: true,
  },
} as const;

const DEFAULT_STARTER_ORGANIZATION_NAME = "My Organization";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isStarterOrganizationMetadata = (metadata: unknown) => {
  if (!isPlainObject(metadata)) {
    return false;
  }

  const onboardingMetadata = metadata.langfuseOnboarding;

  return (
    isPlainObject(onboardingMetadata) &&
    onboardingMetadata.starterOrganization === true
  );
};

export const getStarterOrganizationName = (userName?: string | null) => {
  const firstName = userName?.trim().split(/\s+/)[0];

  return firstName
    ? `${firstName}'s Organization`
    : DEFAULT_STARTER_ORGANIZATION_NAME;
};

/** Whether a name is one getStarterOrganizationName gives, for any user. */
export const isDefaultStarterOrganizationName = (name: string) =>
  name === DEFAULT_STARTER_ORGANIZATION_NAME ||
  /^\S+'s Organization$/.test(name);
