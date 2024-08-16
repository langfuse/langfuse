import { createStripeClientReference } from "@/src/ee/features/billing/stripeClientReference";
import { env } from "@/src/env.mjs";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useSession } from "next-auth/react";
import Script from "next/script";

export function PricingPage(props: { className?: string }) {
  const session = useSession();
  const org = useQueryOrganization();
  if (
    !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
    !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    !org
  )
    return null;

  return (
    <>
      <Script async src="https://js.stripe.com/v3/pricing-table.js" />
      <div className={props.className}>
        <stripe-pricing-table
          client-reference-id={createStripeClientReference(org.id)}
          pricing-table-id={
            env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
              ? "prctbl_1PoNO3AWilt2EAVVwiI1e9V9" // test mode
              : "prctbl_1OjTUyAWilt2EAVVMCMAMDgB" // live mode
          }
          publishable-key={env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
          customer-email={session.data?.user?.email}
        ></stripe-pricing-table>
      </div>
    </>
  );
}
