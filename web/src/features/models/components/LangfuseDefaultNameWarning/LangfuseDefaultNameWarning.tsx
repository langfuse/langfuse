import { Banner } from "@/src/components/design-system/Banner/Banner";

export function LangfuseDefaultNameWarning() {
  return (
    <Banner variant="warning">
      This replaces the Langfuse default for every project in this organization.
      Only the pricing tiers defined here apply, and future Langfuse price
      updates won&apos;t.
    </Banner>
  );
}
