import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useEffect, useState } from "react";
import { showToast } from "@/src/features/notifications";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

export const StripeCustomerPortalButton = ({
  orgId,
  title,
  variant,
}: {
  orgId: string | undefined;
  title: string;
  variant: "secondary" | "default";
}) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Make sure loading is always false when the user enters the page, even when navigation back via browser back button
    const reset = () => setLoading(false);
    const onPageShow = () => setLoading(false); // fires on bfcache restore
    const onVisibility = () => {
      if (document.visibilityState === "visible") setLoading(false);
    };

    window.addEventListener("focus", reset);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", reset);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const portalQuery = api.cloudBilling.getStripeCustomerPortalUrl.useQuery(
    { orgId: orgId as string },
    {
      enabled: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const onClick = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const { data, error } = await portalQuery.refetch();
      if (error) throw error;
      if (data) {
        window.location.href = data;
      } else {
        showToast({
          type: "ERROR",
          title: "Could not open billing portal",
          analytics: {
            operation: "billing_portal.open",
            errorOrigin: "backend",
            errorCategory: "product_state",
          },
        });
      }
    } catch (error) {
      showToast({
        type: "ERROR",
        title: "Failed to open billing portal",
        analytics: classifyTrpcToastError(error, "billing_portal.open"),
      });
    } finally {
      // do not reset to avoid flickering when opening the portal
      // setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={!orgId || loading}
      title={title}
    >
      {loading ? "Opening…" : title}
    </Button>
  );
};
