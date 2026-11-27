import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { planCustomerLogos } from "@/src/ee/features/billing/constants/planCustomerLogos";
import { type CloudPlan } from "@/src/ee/features/billing/constants/pricingPlans";

type PlanCustomerLogosProps = { plan: CloudPlan };

const MAX_LOGOS = 4;

/** The customers the pricing page names for a plan: overlapping round logos, each naming its company on hover. */
export function PlanCustomerLogos({ plan }: PlanCustomerLogosProps) {
  const customers = planCustomerLogos[plan].slice(0, MAX_LOGOS);

  return (
    <div className="text-muted-foreground flex items-center gap-2.5 text-xs">
      <span>Trusted by</span>
      <ul className="flex items-center">
        {customers.map((customer) => (
          <li
            key={customer.name}
            className="border-border relative -ml-2 inline-flex shrink-0 rounded-full border bg-white p-0.5 shadow-sm transition-transform first:ml-0 hover:z-10 hover:-translate-y-0.5"
          >
            <Avatar
              size="lg"
              displayName={customer.name}
              src={customer.image}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
