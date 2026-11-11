import type { ModelDiscoveryAdapter } from "../types";

// Requests name a deployment, and Azure's data-plane APIs cannot list them:
// `GET /openai/v1/models` returns the models the resource could deploy. So
// deployments are added to the connection as custom models.
export const azureModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog() {
    return { success: true, models: [] };
  },
};
