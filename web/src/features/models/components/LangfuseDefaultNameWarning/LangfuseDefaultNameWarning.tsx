import { Banner } from "@/src/components/design-system/Banner/Banner";

export function LangfuseDefaultNameWarning() {
  return (
    <Banner variant="warning">
      Generations that match this pattern use this model instead of the Langfuse
      default, in every project without a matching project model. Only the
      pricing tiers defined here apply, and future Langfuse price updates
      won&apos;t.
    </Banner>
  );
}
