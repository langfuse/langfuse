import { useQueryOrganization } from "@/src/features/organizations/utils/useOrganization";
import Script from "next/script";

export function PricingPage(props: { className?: string }) {
  const org = useQueryOrganization();
  return (
    <>
      <Script async src="https://js.stripe.com/v3/pricing-table.js" />
      <div className={props.className}>
        <stripe-pricing-table
          client-reference-id={org?.id}
          pricing-table-id="prctbl_1OjTUyAWilt2EAVVMCMAMDgB"
          publishable-key="pk_live_51MPW00AWilt2EAVVFWfPTQhgmLA0EeacLSzAs6e3vECCcMBvwcMse81XgXO6k1bdBHbPBdpOmrXE8P1gBrxE7yhH00RPHQ8SyG"
        ></stripe-pricing-table>
      </div>
    </>
  );
}
