import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
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
        <Alert variant="destructive" className="mb-4">
          {/* A fault normally arrives with the auto-disable, but the disable is
              skipped when the host changed mid-run, leaving a fault on a still
              enabled integration — so only promise "disabled" when it is. */}
          <AlertTitle>
            {config.enabled
              ? "Last export failed"
              : "Export disabled – action required"}
          </AlertTitle>
          <AlertDescription>
            {config.lastError}
            {config.lastErrorAt && (
              <>
                <br />
                <span className="text-xs opacity-70">
                  {new Date(config.lastErrorAt).toLocaleString()}
                </span>
              </>
            )}
          </AlertDescription>
        </Alert>
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
