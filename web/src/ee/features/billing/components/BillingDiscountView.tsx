import { api } from "@/src/utils/api";
import { Badge } from "@/src/components/ui/badge";
import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";

export const BillingDiscountView = () => {
  const { organization } = useBillingInformation();
  const shouldRenderComponent = Boolean(
    organization?.cloudConfig?.stripe?.customerId,
  );

  const { data } = api.cloudBilling.getSubscriptionInfo.useQuery(
    { orgId: organization?.id ?? "" },
    { enabled: Boolean(organization?.id && shouldRenderComponent) },
  );

  const discounts = data?.discounts ?? [];
  if (!discounts.length) return null;

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

  if (!shouldRenderComponent) return null;

  if (!discounts.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span className="mr-1">Active discounts:</span>
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
    </div>
  );
};

export default BillingDiscountView;
