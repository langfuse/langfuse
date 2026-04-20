const cloudRegions = [
  {
    name: "DEV",
    flag: "🚧",
    hostname: null,
    rootUrl: null,
  },
  {
    name: "STAGING",
    flag: "🇪🇺",
    hostname: "staging.langfuse.com",
    rootUrl: "https://staging.langfuse.com",
  },
  {
    name: "EU",
    flag: "🇪🇺",
    hostname: "cloud.langfuse.com",
    rootUrl: "https://cloud.langfuse.com",
  },
  {
    name: "US",
    flag: "🇺🇸",
    hostname: "us.cloud.langfuse.com",
    rootUrl: "https://us.cloud.langfuse.com",
  },
  {
    name: "JP",
    flag: "🇯🇵",
    hostname: "jp.cloud.langfuse.com",
    rootUrl: "https://jp.cloud.langfuse.com",
  },
  {
    name: "HIPAA",
    flag: "⚕️",
    hostname: "hipaa.cloud.langfuse.com",
    rootUrl: "https://hipaa.cloud.langfuse.com",
  },
] as const;

const authCloudRegionNamesByCurrentRegion = {
  STAGING: ["STAGING"],
  DEV: ["DEV"],
  JP: ["JP", "US", "EU", "HIPAA"],
  default: ["US", "EU", "HIPAA"],
} as const;

const userNavigationCloudRegionNames = ["EU", "US", "JP", "HIPAA"] as const;

const getCloudRegion = (name: (typeof cloudRegions)[number]["name"]) => {
  const region = cloudRegions.find((region) => region.name === name);
  if (!region) {
    throw new Error(`Unknown cloud region: ${name}`);
  }

  return region;
};

export const getAuthCloudRegionOptions = (currentRegion?: string) => {
  if (currentRegion === "STAGING") {
    return authCloudRegionNamesByCurrentRegion.STAGING.map(getCloudRegion);
  }

  if (currentRegion === "DEV") {
    return authCloudRegionNamesByCurrentRegion.DEV.map(getCloudRegion);
  }

  if (currentRegion === "JP") {
    return authCloudRegionNamesByCurrentRegion.JP.map(getCloudRegion);
  }

  return authCloudRegionNamesByCurrentRegion.default.map(getCloudRegion);
};

export const getUserNavigationCloudRegionOptions = () =>
  userNavigationCloudRegionNames.map(getCloudRegion);
