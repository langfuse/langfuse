// AWS regions offering the Bedrock runtime in the `amazonaws.com` partition.
// Model access still varies by region; testing the key confirms it.
type BedrockRegionGroup = {
  label: string;
  regions: { value: string; label: string }[];
};

export const bedrockRegionGroups: BedrockRegionGroup[] = [
  {
    label: "US & Canada",
    regions: [
      { value: "us-east-1", label: "US East (N. Virginia)" },
      { value: "us-east-2", label: "US East (Ohio)" },
      { value: "us-west-1", label: "US West (N. California)" },
      { value: "us-west-2", label: "US West (Oregon)" },
      { value: "us-gov-east-1", label: "AWS GovCloud (US-East)" },
      { value: "us-gov-west-1", label: "AWS GovCloud (US-West)" },
      { value: "ca-central-1", label: "Canada (Central)" },
      { value: "ca-west-1", label: "Canada West (Calgary)" },
    ],
  },
  {
    label: "Latin America",
    regions: [
      { value: "mx-central-1", label: "Mexico (Central)" },
      { value: "sa-east-1", label: "South America (São Paulo)" },
    ],
  },
  {
    label: "Europe",
    regions: [
      { value: "eu-central-1", label: "Europe (Frankfurt)" },
      { value: "eu-central-2", label: "Europe (Zurich)" },
      { value: "eu-west-1", label: "Europe (Ireland)" },
      { value: "eu-west-2", label: "Europe (London)" },
      { value: "eu-west-3", label: "Europe (Paris)" },
      { value: "eu-north-1", label: "Europe (Stockholm)" },
      { value: "eu-south-1", label: "Europe (Milan)" },
      { value: "eu-south-2", label: "Europe (Spain)" },
    ],
  },
  {
    label: "Asia Pacific",
    regions: [
      { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
      { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
      { value: "ap-northeast-3", label: "Asia Pacific (Osaka)" },
      { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
      { value: "ap-south-2", label: "Asia Pacific (Hyderabad)" },
      { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
      { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
      { value: "ap-southeast-3", label: "Asia Pacific (Jakarta)" },
      { value: "ap-southeast-4", label: "Asia Pacific (Melbourne)" },
      { value: "ap-southeast-5", label: "Asia Pacific (Malaysia)" },
      { value: "ap-southeast-7", label: "Asia Pacific (Thailand)" },
      { value: "ap-east-2", label: "Asia Pacific (Taipei)" },
    ],
  },
  {
    label: "Middle East & Africa",
    regions: [
      { value: "me-central-1", label: "Middle East (UAE)" },
      { value: "me-south-1", label: "Middle East (Bahrain)" },
      { value: "il-central-1", label: "Israel (Tel Aviv)" },
      { value: "af-south-1", label: "Africa (Cape Town)" },
    ],
  },
];
