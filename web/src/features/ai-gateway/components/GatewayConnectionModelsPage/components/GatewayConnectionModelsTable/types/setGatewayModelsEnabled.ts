export type SetGatewayModelsEnabled = (params: {
  models: string[];
  enabled: boolean;
  scope: "single" | "selection";
  onSuccess?: () => void;
}) => void;
