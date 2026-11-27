import { Banner } from "@/src/components/design-system/Banner/Banner";

interface AutomationFailureBannerProps {
  failureCount: number;
  onDismiss: () => void;
}

export const AutomationFailureBanner = ({
  failureCount,
  onDismiss,
}: AutomationFailureBannerProps) => {
  return (
    <div className="mb-4">
      <Banner
        variant="error"
        title={`This automation was automatically disabled due to at least ${failureCount} consecutive webhook failures.`}
        onDismiss={onDismiss}
      >
        Check the execution history below, fix any issues with your webhook
        endpoint, then reactivate the automation.
      </Banner>
    </div>
  );
};
