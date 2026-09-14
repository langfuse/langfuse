import { api } from "@/src/utils/api";
import { Badge } from "@/src/components/ui/badge";
import { BillingDiscountCodeButton } from "@/src/ee/features/billing/components/BillingDiscountCodeButton";

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

  const discounts = data?.discounts ?? [];

  const formatAmount = (value: number, currency: string | null) => {
    const cur = (currency || "USD").toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: cur,
        currencyDisplay: "narrowSymbol",
      }).format(value / 100);
    } catch {
      // Fallback simple formatting
      return `${(value / 100).toFixed(2)} ${cur}`;
    }
  };

  if (!hasStripeCustomer) {
    return (
      <div className="flex items-center">
        <BillingDiscountCodeButton orgId={orgId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-1">Discounts:</span>
        {discounts.map((d) => {
          const labelParts: string[] = [];
          if (d.code) labelParts.push(d.code);
          else if (d.name) labelParts.push(d.name);

          if (d.kind === "percent") labelParts.push(`${d.value}% off`);
          else labelParts.push(`${formatAmount(d.value, d.currency)} off`);

          return (
            <Badge key={d.id} variant="secondary" className="font-normal">
              {labelParts.join(" · ")}
            </Badge>
          );
        })}
        <BillingDiscountCodeButton orgId={orgId} />
      </div>
    </div>
  );
};
