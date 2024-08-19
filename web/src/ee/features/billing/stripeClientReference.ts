import { env } from "@/src/env.mjs";

// used client-side to create a stripe customer reference
export const createStripeClientReference = (orgId: string) => {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    console.error(
      "Returning null stripeCustomerReference, you cannot run the checkout page outside of Langfuse Cloud",
    );
    return null;
  }
  return `${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}-${orgId}`;
};

// used server-side to check if the stripe customer reference is valid and parse the orgId
export const isStripeClientReferenceFromCurrentCloudRegion = (
  clientReference: string,
) =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
  clientReference.startsWith(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

export const getOrgIdFromStripeClientReference = (clientReference: string) =>
  clientReference.replace(`${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}-`, "");
