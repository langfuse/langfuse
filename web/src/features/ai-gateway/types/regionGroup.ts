/** Cloud regions a connection can send its requests to, grouped by geography. */
export type RegionGroup = {
  label: string;
  regions: { value: string; label: string }[];
};
