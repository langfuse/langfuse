import type { RegionGroup } from "@/src/features/ai-gateway/types/regionGroup";

// Vertex AI generative AI locations, from
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations.
// Model availability still varies by location; testing the key confirms it.
export const vertexLocationGroups: RegionGroup[] = [
  {
    label: "Global",
    regions: [{ value: "global", label: "Global endpoint" }],
  },
  {
    label: "Americas",
    regions: [
      { value: "us-central1", label: "Iowa" },
      { value: "us-east1", label: "South Carolina" },
      { value: "us-east4", label: "Northern Virginia" },
      { value: "us-east5", label: "Columbus" },
      { value: "us-south1", label: "Dallas" },
      { value: "us-west1", label: "Oregon" },
      { value: "us-west4", label: "Las Vegas" },
      { value: "northamerica-northeast1", label: "Montréal" },
      { value: "southamerica-east1", label: "São Paulo" },
    ],
  },
  {
    label: "Europe",
    regions: [
      { value: "europe-west1", label: "Belgium" },
      { value: "europe-west2", label: "London" },
      { value: "europe-west3", label: "Frankfurt" },
      { value: "europe-west4", label: "Netherlands" },
      { value: "europe-west6", label: "Zürich" },
      { value: "europe-west8", label: "Milan" },
      { value: "europe-west9", label: "Paris" },
      { value: "europe-southwest1", label: "Madrid" },
      { value: "europe-north1", label: "Finland" },
      { value: "europe-central2", label: "Warsaw" },
    ],
  },
  {
    label: "Asia Pacific",
    regions: [
      { value: "asia-east1", label: "Taiwan" },
      { value: "asia-east2", label: "Hong Kong" },
      { value: "asia-northeast1", label: "Tokyo" },
      { value: "asia-northeast3", label: "Seoul" },
      { value: "asia-south1", label: "Mumbai" },
      { value: "asia-southeast1", label: "Singapore" },
      { value: "australia-southeast1", label: "Sydney" },
    ],
  },
  {
    label: "Middle East",
    regions: [
      { value: "me-central1", label: "Doha" },
      { value: "me-central2", label: "Dammam" },
      { value: "me-west1", label: "Tel Aviv" },
    ],
  },
];
