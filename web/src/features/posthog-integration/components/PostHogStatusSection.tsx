import Header from "@/src/components/layouts/header";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { type RouterOutputs } from "@/src/utils/api";

type PostHogIntegrationConfig = NonNullable<
  RouterOutputs["posthogIntegration"]["get"]["config"]
>;

/**
 * PostHogStatusSection surfaces the persisted export fault next to the sync
 * line. Neither is gated on `enabled`: a customer-config fault auto-disables
 * the integration, so gating would hide the explanation at the one moment it
 * is needed, and a manually disabled integration would render a bare header.
 */
export const PostHogStatusSection = ({
  config,
}: {
  config: PostHogIntegrationConfig;
}) => {
  return (
    <>
      <Header title="Status" className="mt-8" />
      {config.lastError && (
        <div className="mb-4">
          <Banner
            variant="error"
            // A fault normally arrives with the auto-disable, but the disable is
            // skipped when the host changed mid-run, leaving a fault on a still
            // enabled integration — so only promise "disabled" when it is.
            title={
              config.enabled
                ? "Last export failed"
                : "Export disabled – action required"
            }
          >
            {config.lastError}
            {config.lastErrorAt && (
              <>
                <br />
                {new Date(config.lastErrorAt).toLocaleString()}
              </>
            )}
          </Banner>
        </div>
      )}
      <p className="text-primary text-sm">
        Data synced until:{" "}
        {config.lastSyncAt
          ? new Date(config.lastSyncAt).toLocaleString()
          : "Never (pending)"}
      </p>
    </>
  );
};
