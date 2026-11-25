import { Banner } from "@/src/components/design-system/Banner/Banner";

/** The gateway enforces no spend limits while ingestion records nothing. */
export function IngestionSpendLimitsAlert() {
  return (
    <Banner variant="warning" title="Budgets stop applying">
      Gateway keys can spend without limit while nothing is recorded. Your
      budgets apply again once you turn ingestion back on.
    </Banner>
  );
}
