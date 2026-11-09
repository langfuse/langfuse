export type GatewayModelAccessChange = {
  models: string[];
  enabled: boolean;
  scope: "single" | "selection" | "all";
};
