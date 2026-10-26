const langfuseCloudUrls = {
  US: "https://us.cloud.langfuse.com",
  EU: "https://cloud.langfuse.com",
  STAGING: "https://staging.langfuse.com",
  HIPAA: "https://hipaa.cloud.langfuse.com",
  JP: "https://jp.cloud.langfuse.com",
};

/** Base URL for links in transactional emails: the cloud region's public URL, else NEXTAUTH_URL. */
export function getEmailAppBaseUrl(env: {
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION?: string;
  NEXTAUTH_URL?: string;
}): string | undefined {
  const region = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  if (region && region in langfuseCloudUrls) {
    return langfuseCloudUrls[region as keyof typeof langfuseCloudUrls];
  }
  return env.NEXTAUTH_URL;
}
