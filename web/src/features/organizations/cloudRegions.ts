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

const availableRegionsByCurrentRegion = {
  STAGING: ["STAGING"],
  DEV: ["DEV"],
  JP: ["JP", "US", "EU", "HIPAA"],
  default: ["US", "EU", "HIPAA"],
} as const;

const getCloudRegion = (name: (typeof cloudRegions)[number]["name"]) => {
  const region = cloudRegions.find((region) => region.name === name);
  if (!region) {
    throw new Error(`Unknown cloud region: ${name}`);
  }

  return region;
};

export const getAvailableCloudRegionOptions = (currentRegion?: string) => {
  if (currentRegion === "STAGING") {
    return availableRegionsByCurrentRegion.STAGING.map(getCloudRegion);
  }

  if (currentRegion === "DEV") {
    return availableRegionsByCurrentRegion.DEV.map(getCloudRegion);
  }

  if (currentRegion === "JP") {
    return availableRegionsByCurrentRegion.JP.map(getCloudRegion);
  }

  return availableRegionsByCurrentRegion.default.map(getCloudRegion);
};

export const isRegionProduction = (regionName: string): boolean => {
  const region = cloudRegions.find((r) => r.name === regionName);
  return region ? region.isProduction : false;
};
