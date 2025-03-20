const langfuseUrls = {
  US: "https://us.cloud.langfuse.com",
  EU: "https://cloud.langfuse.com",
  STAGING: "https://staging.langfuse.com",
  DEV: "http://localhost:3000",
};

export const getLangfuseUrl = (
  cloudRegion: "US" | "EU" | "STAGING" | "DEV",
) => {
  return langfuseUrls[cloudRegion as keyof typeof langfuseUrls];
};
