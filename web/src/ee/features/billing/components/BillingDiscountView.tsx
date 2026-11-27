import { BillingDiscountCodeButton } from "@/src/ee/features/billing/components/BillingDiscountCodeButton";
import { formatDiscount } from "@/src/ee/features/billing/utils/formatDiscount";
import { api } from "@/src/utils/api";

/** The discounts on an organization's Stripe subscription, each on one line, then the way to add a code. */
export const BillingDiscountView = ({
  orgId,
  hasStripeCustomer,
}: {
  orgId: string;
  hasStripeCustomer: boolean;
}) => {
  const { data } = api.cloudBilling.getSubscriptionInfo.useQuery(
    { orgId },
    { enabled: hasStripeCustomer },
  );
  const discounts = (data?.discounts ?? []).map((discount) => ({
    id: discount.id,
    ...formatDiscount(discount),
  }));

  return (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 text-sm">
      {discounts.map((discount) => (
        // A promotion code is the customer's own, kept out of session replay.
        <span key={discount.id} className="ph-no-capture">
          {discount.label}, {discount.text}
        </span>
      ))}
      <BillingDiscountCodeButton
        orgId={orgId}
        label={discounts.length > 0 ? "Add another code" : "Add promotion code"}
      />
    </div>
  );
};
