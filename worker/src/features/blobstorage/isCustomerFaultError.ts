export {
  classifyCustomerFault,
  isCustomerFaultError,
  type CustomerFaultReason,
} from "../integrations/customerFaultClassification";

// Counter for integrations auto-disabled after a terminal customer fault, tagged
// by `reason`. Lets a rollout regression (a classifier bug mass-disabling
// working integrations) show up as a spike in the non-SSRF buckets against a
// near-zero baseline, separately from expected SSRF/abuse disables.
export const BLOB_INTEGRATION_DISABLED_METRIC =
  "langfuse.blobstorage.integration_disabled.count";
