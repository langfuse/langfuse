const cloudRegions = [
  {
    name: "DEV",
    flag: "🚧",
    hostname: null,
    rootUrl: null,
    isProduction: false,
  },
  {
    name: "STAGING",
    flag: "🇪🇺",
    hostname: "staging.langfuse.com",
    rootUrl: "https://staging.langfuse.com",
    isProduction: false,
  },
  {
    name: "EU",
    flag: "🇪🇺",
    hostname: "cloud.langfuse.com",
    rootUrl: "https://cloud.langfuse.com",
    isProduction: true,
  },
  {
    name: "US",
    flag: "🇺🇸",
    hostname: "us.cloud.langfuse.com",
    rootUrl: "https://us.cloud.langfuse.com",
    isProduction: true,
  },
  {
    name: "JP",
    flag: "🇯🇵",
    hostname: "jp.cloud.langfuse.com",
    rootUrl: "https://jp.cloud.langfuse.com",
    isProduction: true,
  },
  {
    name: "HIPAA",
    flag: "⚕️",
    hostname: "hipaa.cloud.langfuse.com",
    rootUrl: "https://hipaa.cloud.langfuse.com",
    isProduction: true,
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

export const isRegionProduction = (regionName: string): boolean => {
  const region = cloudRegions.find((r) => r.name === regionName);
  return region ? region.isProduction : false;
};

export const getUserNavigationCloudRegionOptions = () =>
  userNavigationCloudRegionNames.map(getCloudRegion);
